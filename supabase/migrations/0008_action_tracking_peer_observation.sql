-- Tend · 0008 tracking plan actions to completion, and Peer Match as a real 15-minute peer observation.
--   • Any endorsed action can be marked done (with an optional note) and undone.
--   • A peer action is tied to the colleague it names. After the leader endorses it, the educator asks
--     that colleague; the colleague accepts with a time (or declines); afterwards the educator records
--     what they noticed and one thing they'll try. That completes the action and logs 15 CPD minutes.
-- Writes go through the functions below (security definer), like observation requests in 0005.

alter table public.idp_action
  add column peer_user_id uuid references public.app_user(id) on delete set null,
  add column completed_at timestamptz,
  add column completion_note text check (completion_note is null or char_length(completion_note) <= 500),
  add column cpd_minutes int check (cpd_minutes is null or cpd_minutes between 0 and 10000);

create table public.peer_observation (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  idp_action_id uuid not null references public.idp_action(id) on delete cascade,
  observer_id uuid not null references public.app_user(id) on delete cascade, -- the educator who learns by watching
  peer_id uuid not null references public.app_user(id) on delete cascade,     -- the colleague being watched
  indicator_code text not null,
  status text not null default 'requested' check (status in ('requested','accepted','declined','cancelled','done')),
  proposed_at timestamptz,          -- the observer's suggested time (optional)
  scheduled_at timestamptz,         -- the agreed time (set when the peer accepts)
  request_note text check (request_note is null or char_length(request_note) <= 300),
  peer_note text check (peer_note is null or char_length(peer_note) <= 300),
  noticed text check (noticed is null or char_length(noticed) <= 1000),
  will_try text check (will_try is null or char_length(will_try) <= 500),
  responded_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check (observer_id <> peer_id)
);
-- One live request per action: ask again only after a decline or cancellation.
create unique index peer_observation_one_live on public.peer_observation (idp_action_id) where status in ('requested', 'accepted');
create index on public.peer_observation (peer_id, status);
create index on public.peer_observation (observer_id, status);

alter table public.peer_observation enable row level security;
grant select on public.peer_observation to authenticated;
grant all on public.peer_observation to service_role;
-- The two educators involved, and the observer's centre leader (the reflection is evidence for their goal).
create policy peer_obs_parties on public.peer_observation for select to authenticated
  using (observer_id = auth.uid() or peer_id = auth.uid());
create policy peer_obs_leader on public.peer_observation for select to authenticated
  using (app.is_leader(app.educator_centre(observer_id)));

-- The educator who owns an action (not a leader acting on their plan).
create or replace function app.action_owner(p_action uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select app.idp_owner(app.goal_idp(a.idp_goal_id)) from public.idp_action a where a.id = p_action
$$;

-- ── Mark done / undo (any action except peer actions, which complete through their reflection) ──

create or replace function public.complete_action(p_action uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.idp_action; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into a from public.idp_action where id = p_action for update;
  if not found or app.action_owner(p_action) is distinct from auth.uid() then raise exception 'not your action'; end if;
  if a.status <> 'open' then raise exception 'only an endorsed, open action can be marked done'; end if;
  if a.peer_user_id is not null then raise exception 'record what you noticed to complete a peer observation'; end if;
  update public.idp_action set status = 'done', completed_at = now(), completion_note = left(v_note, 500) where id = p_action;
end $$;

create or replace function public.reopen_action(p_action uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a public.idp_action;
begin
  select * into a from public.idp_action where id = p_action for update;
  if not found or app.action_owner(p_action) is distinct from auth.uid() then raise exception 'not your action'; end if;
  if a.status <> 'done' then raise exception 'that action is not done'; end if;
  if a.peer_user_id is not null then raise exception 'a completed peer observation cannot be undone'; end if;
  update public.idp_action set status = 'open', completed_at = null, completion_note = null where id = p_action;
end $$;

-- ── Peer observation ──

create or replace function public.request_peer_observation(p_action uuid, p_when timestamptz default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare a public.idp_action; v_code text; v_id uuid; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into a from public.idp_action where id = p_action for update;
  if not found or app.action_owner(p_action) is distinct from auth.uid() then raise exception 'not your action'; end if;
  if a.peer_user_id is null then raise exception 'this action is not a peer observation'; end if;
  if a.status <> 'open' then raise exception 'your leader needs to endorse this action first'; end if;
  if not exists (select 1 from public.educator_profile p join public.app_user u on u.id = p.user_id
                 where p.user_id = a.peer_user_id and p.peer_match_opt_in and u.org_id = app.my_org()) then
    raise exception 'that colleague is not available for peer observation';
  end if;
  if p_when is not null and p_when < now() - interval '1 hour' then raise exception 'choose a time in the future'; end if;
  select i.code into v_code from public.idp_goal g join public.indicator i on i.id = g.indicator_id where g.id = a.idp_goal_id;
  begin
    insert into public.peer_observation (org_id, idp_action_id, observer_id, peer_id, indicator_code, proposed_at, request_note)
    values (a.org_id, a.id, auth.uid(), a.peer_user_id, v_code, p_when, left(v_note, 300))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'you have already asked';
  end;
  insert into public.notification (org_id, user_id, kind, payload)
  values (a.org_id, a.peer_user_id, 'peer_observation_requested', jsonb_build_object('peer_observation_id', v_id, 'observer_id', auth.uid()));
  return v_id;
end $$;

-- The colleague answers: accept (a time is required: theirs, or the one proposed) or decline.
create or replace function public.respond_peer_observation(p_id uuid, p_accept boolean, p_when timestamptz default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.peer_observation; v_when timestamptz; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into r from public.peer_observation where id = p_id for update;
  if not found or r.peer_id <> auth.uid() then raise exception 'not your request'; end if;
  if r.status <> 'requested' then raise exception 'that request has already been answered'; end if;
  if p_accept then
    v_when := coalesce(p_when, r.proposed_at);
    if v_when is null then raise exception 'choose a time'; end if;
    update public.peer_observation set status = 'accepted', scheduled_at = v_when, peer_note = left(v_note, 300), responded_at = now() where id = p_id;
  else
    update public.peer_observation set status = 'declined', peer_note = left(v_note, 300), responded_at = now() where id = p_id;
  end if;
  insert into public.notification (org_id, user_id, kind, payload)
  values (r.org_id, r.observer_id, case when p_accept then 'peer_observation_accepted' else 'peer_observation_declined' end,
          jsonb_build_object('peer_observation_id', r.id));
end $$;

-- The observer withdraws (before it happens).
create or replace function public.cancel_peer_observation(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.peer_observation;
begin
  select * into r from public.peer_observation where id = p_id for update;
  if not found or r.observer_id <> auth.uid() then raise exception 'not your request'; end if;
  if r.status not in ('requested', 'accepted') then raise exception 'that request is already closed'; end if;
  update public.peer_observation set status = 'cancelled', responded_at = coalesce(responded_at, now()) where id = p_id;
  insert into public.notification (org_id, user_id, kind, payload)
  values (r.org_id, r.peer_id, 'peer_observation_cancelled', jsonb_build_object('peer_observation_id', r.id));
end $$;

-- After the session: what I noticed + one thing I'll try. Completes the action and logs 15 CPD minutes.
create or replace function public.complete_peer_observation(p_id uuid, p_noticed text, p_will_try text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.peer_observation;
        v_noticed text := nullif(btrim(coalesce(p_noticed, '')), '');
        v_try text := nullif(btrim(coalesce(p_will_try, '')), '');
begin
  select * into r from public.peer_observation where id = p_id for update;
  if not found or r.observer_id <> auth.uid() then raise exception 'not your request'; end if;
  if r.status <> 'accepted' then raise exception 'the session has not been agreed yet'; end if;
  if r.scheduled_at > now() + interval '1 hour' then raise exception 'record this after the session'; end if;
  if v_noticed is null or char_length(v_noticed) < 10 then raise exception 'write a sentence about what you noticed'; end if;
  if v_try is null then raise exception 'add one thing you will try'; end if;
  update public.peer_observation
     set status = 'done', noticed = left(v_noticed, 1000), will_try = left(v_try, 500), completed_at = now()
   where id = p_id;
  update public.idp_action
     set status = 'done', completed_at = now(), cpd_minutes = 15, completion_note = left('I’ll try: ' || v_try, 500)
   where id = r.idp_action_id;
  insert into public.notification (org_id, user_id, kind, payload)
  values (r.org_id, r.peer_id, 'peer_observation_thanks', jsonb_build_object('peer_observation_id', r.id));
end $$;

-- ── Plan revisions (from 0003) now carry the tracking fields, and move peer sessions to the copied action ──

create or replace function public.decide_idp_suggestion(p_id uuid, p_accept boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare s public.idp_suggestion; i public.idp; v_new uuid; g record; v_new_goal uuid; a record; v_new_action uuid;
begin
  select * into s from public.idp_suggestion where id = p_id for update;
  if s.id is null then raise exception 'suggestion not found'; end if;
  select * into i from public.idp where id = s.idp_id;
  if not app.is_leader(i.centre_id) then raise exception 'only a centre leader can decide suggestions'; end if;
  if s.status <> 'pending' then raise exception 'already decided'; end if;
  update public.idp_suggestion set status = case when p_accept then 'accepted' else 'declined' end, decided_by = auth.uid(), decided_at = now() where id = p_id;
  if not p_accept then return null; end if;

  -- Accepting creates a new IDP version (history is kept).
  insert into public.idp (org_id, centre_id, educator_id, lineage_id, version, status, educator_confirmed_at, leader_confirmed_at, leader_confirmed_by, created_by)
  values (i.org_id, i.centre_id, i.educator_id, i.lineage_id, (select max(version) + 1 from public.idp where lineage_id = i.lineage_id),
          'draft', i.educator_confirmed_at, now(), auth.uid(), auth.uid())
  returning id into v_new;
  for g in select * from public.idp_goal where idp_id = i.id order by position loop
    insert into public.idp_goal (org_id, idp_id, indicator_id, framework_version_id, current_level, target_level, tsc_id, review_date, position)
    values (g.org_id, v_new, g.indicator_id, g.framework_version_id,
            case when g.id = s.idp_goal_id then coalesce((s.payload ->> 'current_level')::int, g.current_level) else g.current_level end,
            case when g.id = s.idp_goal_id then coalesce((s.payload ->> 'target_level')::int, g.target_level) else g.target_level end,
            g.tsc_id, g.review_date, g.position)
    returning id into v_new_goal;
    for a in select * from public.idp_action where idp_goal_id = g.id order by created_at loop
      insert into public.idp_action (org_id, idp_goal_id, description, source, status, pd_activity_id, endorsed_by,
                                     peer_user_id, completed_at, completion_note, cpd_minutes, created_at)
      values (a.org_id, v_new_goal, a.description, a.source, a.status, a.pd_activity_id, a.endorsed_by,
              a.peer_user_id, a.completed_at, a.completion_note, a.cpd_minutes, a.created_at)
      returning id into v_new_action;
      update public.peer_observation set idp_action_id = v_new_action where idp_action_id = a.id;
    end loop;
  end loop;
  update public.idp set status = 'superseded' where id = i.id;
  update public.idp set status = 'active' where id = v_new;
  update public.idp_suggestion set idp_id = v_new where idp_id = i.id and status = 'pending';
  return v_new;
end $$;

grant execute on all functions in schema public to authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;
