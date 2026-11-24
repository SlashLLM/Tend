-- Tend · 0005 educator-initiated observation requests.
-- An educator asks; the centre leader still decides when (and whether). Leaders keep sole control of the
-- calendar and of who gets observed, so coverage in Centre Insights stays a fair sample.

create table public.observation_request (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  centre_id uuid not null references public.centre(id) on delete cascade,
  educator_id uuid not null references public.app_user(id) on delete cascade,
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'open' check (status in ('open','scheduled','declined','withdrawn')),
  observation_id uuid references public.observation(id) on delete set null,
  decided_by uuid references public.app_user(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
-- One open request per educator: no flooding the leader's queue.
create unique index observation_request_one_open on public.observation_request (educator_id) where status = 'open';
create index on public.observation_request (centre_id, status);

alter table public.observation_request enable row level security;
grant select on public.observation_request to authenticated;
grant all on public.observation_request to service_role;
create policy request_educator on public.observation_request for select to authenticated using (educator_id = auth.uid());
create policy request_leader on public.observation_request for select to authenticated using (app.is_leader(centre_id));

-- Educator asks to be observed. Writes happen only through these functions.
create or replace function public.request_observation(p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_centre uuid; v_id uuid; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  v_centre := app.educator_centre(auth.uid());
  if v_centre is null then raise exception 'only an educator can request an observation'; end if;
  if exists (select 1 from public.observation o
             where o.educator_id = auth.uid() and o.status in ('scheduled', 'capturing')) then
    raise exception 'you already have an observation coming up';
  end if;
  begin
    insert into public.observation_request (org_id, centre_id, educator_id, note)
    values (app.my_org(), v_centre, auth.uid(), v_note)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'you already have an open request';
  end;
  insert into public.notification (org_id, user_id, kind, payload)
  select app.my_org(), m.user_id, 'observation_requested', jsonb_build_object('request_id', v_id, 'educator_id', auth.uid())
  from public.membership m where m.centre_id = v_centre and m.role = 'leader';
  return v_id;
end $$;

-- Scheduling can now fulfil a request in the same transaction. The optional argument changes the
-- signature, so the old function is dropped first (two overloads would make named-argument RPC calls ambiguous).
drop function if exists public.schedule_observation(uuid, timestamptz, int, uuid, text);
create or replace function public.schedule_observation(
  p_educator uuid, p_scheduled_at timestamptz, p_duration_min int default 20,
  p_class uuid default null, p_title text default null, p_request uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_centre uuid; v_id uuid; v_fv uuid; r public.observation_request;
begin
  v_centre := app.educator_centre(p_educator);
  if v_centre is null then raise exception 'educator has no centre'; end if;
  if not app.is_leader(v_centre) then raise exception 'only a centre leader can schedule observations'; end if;
  if p_request is not null then
    select * into r from public.observation_request where id = p_request for update;
    if not found or r.status <> 'open' or r.educator_id <> p_educator or r.centre_id <> v_centre then
      raise exception 'that request is no longer open';
    end if;
  end if;
  select fv.id into v_fv from public.framework_version fv join public.framework f on f.id = fv.framework_id
   where f.code = 'QTT' and fv.status = 'active' order by fv.activated_at desc nulls last limit 1;
  insert into public.observation (org_id, centre_id, educator_id, observer_id, class_id, scheduled_at,
                                  duration_min, title, framework_version_id)
  values (app.my_org(), v_centre, p_educator, auth.uid(), p_class, p_scheduled_at, p_duration_min, p_title, v_fv)
  returning id into v_id;
  if p_request is not null then
    update public.observation_request
       set status = 'scheduled', observation_id = v_id, decided_by = auth.uid(), decided_at = now()
     where id = p_request;
  end if;
  insert into public.notification (org_id, user_id, kind, payload)
  values (app.my_org(), p_educator, 'observation_scheduled', jsonb_build_object('observation_id', v_id));
  return v_id;
end $$;

-- 'withdraw' (the educator) or 'decline' (a leader of that centre). Only an open request can be closed.
create or replace function public.resolve_observation_request(p_request uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.observation_request;
begin
  select * into r from public.observation_request where id = p_request for update;
  if not found or r.status <> 'open' then raise exception 'that request is no longer open'; end if;
  if p_action = 'withdraw' then
    if r.educator_id <> auth.uid() then raise exception 'only the requesting educator can withdraw a request'; end if;
    update public.observation_request set status = 'withdrawn', decided_by = auth.uid(), decided_at = now() where id = r.id;
  elsif p_action = 'decline' then
    if not app.is_leader(r.centre_id) then raise exception 'only a centre leader can decline a request'; end if;
    update public.observation_request set status = 'declined', decided_by = auth.uid(), decided_at = now() where id = r.id;
    insert into public.notification (org_id, user_id, kind, payload)
    values (r.org_id, r.educator_id, 'observation_request_declined', jsonb_build_object('request_id', r.id));
  else
    raise exception 'unknown action %', p_action;
  end if;
end $$;

grant execute on all functions in schema public to authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;
