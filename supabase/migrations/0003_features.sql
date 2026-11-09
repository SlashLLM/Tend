-- Tend · 0003 feature functions (LNA → IDP, suggestions, debrief, coaching, pathways, insights, metrics).
-- All SECURITY DEFINER functions re-check the caller's role; all return only what that role may see.

alter table public.observation add column if not exists transcript_wer numeric check (transcript_wer between 0 and 1);
alter table public.observation add column if not exists focus_indicator_codes text[] not null default '{}';

-- idp_suggestion was declared in Appendix B; create it here.
create table if not exists public.idp_suggestion (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  idp_id uuid not null references public.idp(id) on delete cascade,
  idp_goal_id uuid references public.idp_goal(id) on delete cascade,
  observation_id uuid references public.observation(id) on delete set null,
  kind text not null check (kind in ('level_update','raise_target','add_goal')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  decided_by uuid references public.app_user(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.idp_suggestion enable row level security;
grant select on public.idp_suggestion to authenticated;
grant all on public.idp_suggestion to service_role;
create policy suggestion_read on public.idp_suggestion for select to authenticated using (app.can_see_idp(idp_id));

-- ───────────────────────── helpers ─────────────────────────

create or replace function app.active_qtt_indicator(p_code text) returns uuid
language sql stable security definer set search_path = public as $$
  select i.id from public.indicator i
  join public.framework_version fv on fv.id = i.framework_version_id and fv.status = 'active'
  join public.framework f on f.id = fv.framework_id and f.code in ('QTT','EYDF')
  where i.code = p_code order by fv.activated_at desc nulls last limit 1
$$;

create or replace function app.active_idp(p_educator uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.idp where educator_id = p_educator and status = 'active' order by version desc limit 1
$$;

-- ───────────────────────── LNA ─────────────────────────

create or replace function public.start_lna() returns uuid
language plpgsql security definer set search_path = public as $$
declare p public.educator_profile; v_tpl uuid; v_id uuid;
begin
  select * into p from public.educator_profile where user_id = auth.uid();
  if p.user_id is null then raise exception 'only educators take the needs analysis'; end if;
  select id into v_id from public.lna_attempt where educator_id = auth.uid() and status = 'in_progress' order by started_at desc limit 1;
  if v_id is not null then return v_id; end if;
  select t.id into v_tpl from public.lna_template t
   where t.age_group = p.age_group and (t.org_id is null or t.org_id = p.org_id)
   order by (t.occupational_title_id is not distinct from p.occupational_title_id) desc, t.org_id nulls last, t.created_at desc limit 1;
  if v_tpl is null then raise exception 'no needs-analysis template for this role'; end if;
  insert into public.lna_attempt (org_id, centre_id, educator_id, template_id) values (p.org_id, p.centre_id, auth.uid(), v_tpl)
  returning id into v_id;
  return v_id;
end $$;

-- p_snapshot = {strengths:[...], growth_areas:[...], suggested_goals:[{indicator,current_level,target_level,reason}]}
create or replace function public.complete_lna(p_attempt uuid, p_snapshot jsonb, p_summary text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare a public.lna_attempt; v_idp uuid; v_lineage uuid; v_version int := 1; g jsonb; v_ind uuid; v_pos int := 0; v_fv uuid; v_tsc uuid;
begin
  select * into a from public.lna_attempt where id = p_attempt for update;
  if a.id is null or a.educator_id <> auth.uid() then raise exception 'not your needs analysis'; end if;
  if a.status <> 'in_progress' then raise exception 'needs analysis already completed'; end if;
  if jsonb_typeof(p_snapshot -> 'suggested_goals') <> 'array' or jsonb_array_length(p_snapshot -> 'suggested_goals') not between 1 and 3 then
    raise exception 'snapshot must suggest 1–3 goals';
  end if;

  insert into public.lna_result (attempt_id, org_id, centre_id, educator_id, strengths, growth_areas, suggested_goals, summary)
  values (a.id, a.org_id, a.centre_id, a.educator_id, coalesce(p_snapshot -> 'strengths', '[]'), coalesce(p_snapshot -> 'growth_areas', '[]'),
          p_snapshot -> 'suggested_goals', p_summary);
  update public.lna_attempt set status = 'completed', completed_at = now() where id = a.id;

  -- New IDP draft (next version of the lineage if one exists).
  select lineage_id, version + 1 into v_lineage, v_version from public.idp where educator_id = a.educator_id order by version desc limit 1;
  insert into public.idp (org_id, centre_id, educator_id, lineage_id, version, created_by)
  values (a.org_id, a.centre_id, a.educator_id, coalesce(v_lineage, gen_random_uuid()), coalesce(v_version, 1), auth.uid())
  returning id into v_idp;

  for g in select * from jsonb_array_elements(p_snapshot -> 'suggested_goals') loop
    v_ind := app.active_qtt_indicator(g ->> 'indicator');
    if v_ind is null then raise exception 'unknown indicator %', g ->> 'indicator'; end if;
    select framework_version_id into v_fv from public.indicator where id = v_ind;
    select tsc_id into v_tsc from public.indicator_tsc_map where indicator_id = v_ind limit 1;
    insert into public.idp_goal (org_id, idp_id, indicator_id, framework_version_id, current_level, target_level, tsc_id, review_date, position)
    values (a.org_id, v_idp, v_ind, v_fv, (g ->> 'current_level')::int, (g ->> 'target_level')::int, v_tsc, current_date + 56, v_pos);
    v_pos := v_pos + 1;
  end loop;

  insert into public.notification (org_id, user_id, kind, payload)
  select a.org_id, m.user_id, 'idp_ready_to_cocreate', jsonb_build_object('idp_id', v_idp, 'educator_id', a.educator_id)
  from public.membership m where m.centre_id = a.centre_id and m.role = 'leader';
  return v_idp;
end $$;

-- ───────────────────────── IDP suggestions (never automatic) ─────────────────────────

create or replace function app.create_idp_suggestions(p_obs uuid) returns int
language plpgsql security definer set search_path = public as $$
declare o public.observation; v_idp uuid; r record; n int := 0;
begin
  select * into o from public.observation where id = p_obs;
  v_idp := app.active_idp(o.educator_id);
  if v_idp is null then return 0; end if;
  for r in
    select g.id goal_id, g.current_level, g.target_level, max(t.level) seen
    from public.idp_goal g join public.tag t on t.indicator_id = g.indicator_id
    where g.idp_id = v_idp and t.observation_id = p_obs and t.state = 'accepted'
    group by g.id, g.current_level, g.target_level
  loop
    if r.seen >= r.target_level and r.target_level < 3 then
      insert into public.idp_suggestion (org_id, idp_id, idp_goal_id, observation_id, kind, payload)
      values (o.org_id, v_idp, r.goal_id, p_obs, 'raise_target', jsonb_build_object('current_level', r.seen, 'target_level', least(3, r.seen + 1)));
      n := n + 1;
    elsif r.seen > coalesce(r.current_level, 0) then
      insert into public.idp_suggestion (org_id, idp_id, idp_goal_id, observation_id, kind, payload)
      values (o.org_id, v_idp, r.goal_id, p_obs, 'level_update', jsonb_build_object('current_level', r.seen));
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

create or replace function public.decide_idp_suggestion(p_id uuid, p_accept boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare s public.idp_suggestion; i public.idp; v_new uuid; g record; v_new_goal uuid;
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
    insert into public.idp_action (org_id, idp_goal_id, description, source, status, pd_activity_id, endorsed_by)
    select org_id, v_new_goal, description, source, status, pd_activity_id, endorsed_by from public.idp_action where idp_goal_id = g.id;
  end loop;
  update public.idp set status = 'superseded' where id = i.id;
  update public.idp set status = 'active' where id = v_new;
  update public.idp_suggestion set idp_id = v_new where idp_id = i.id and status = 'pending';
  return v_new;
end $$;

-- Hook suggestions into the approval gate.
create or replace function app.after_share() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'shared' and old.status in ('ai_draft','in_review') then
    perform app.create_idp_suggestions(new.id);
  end if;
  return new;
end $$;
drop trigger if exists observation_after_share on public.observation;
create trigger observation_after_share after update of status on public.observation
  for each row execute function app.after_share();

-- ───────────────────────── debrief ─────────────────────────

-- p_actions = [{goal_id, description}]
create or replace function public.complete_debrief(p_obs uuid, p_notes text, p_actions jsonb default '[]', p_agenda jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare o public.observation; a jsonb; v_goal uuid;
begin
  select * into o from public.observation where id = p_obs for update;
  if o.id is null or not app.is_leader(o.centre_id) then raise exception 'only a centre leader can complete a debrief'; end if;
  if o.status not in ('shared','acknowledged') then raise exception 'debrief happens after feedback is shared'; end if;
  insert into public.debrief (org_id, observation_id, agenda, notes, started_at, completed_at)
  values (o.org_id, p_obs, p_agenda, p_notes, now(), now())
  on conflict (observation_id) do update set notes = excluded.notes, agenda = coalesce(excluded.agenda, public.debrief.agenda), completed_at = now();
  for a in select * from jsonb_array_elements(coalesce(p_actions, '[]')) loop
    v_goal := (a ->> 'goal_id')::uuid;
    if not exists (select 1 from public.idp_goal g join public.idp i on i.id = g.idp_id where g.id = v_goal and i.educator_id = o.educator_id) then
      raise exception 'action goal must belong to the educator''s IDP';
    end if;
    insert into public.idp_action (org_id, idp_goal_id, description, source, status, endorsed_by)
    values (o.org_id, v_goal, a ->> 'description', 'debrief', 'open', auth.uid());
  end loop;
  update public.observation set status = 'discussed' where id = p_obs;
end $$;

-- ───────────────────────── coaching ─────────────────────────

create or replace function public.log_strategy_attempt(p_card uuid, p_note text default null, p_photo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.coaching_card; p public.educator_profile; v_id uuid;
begin
  select * into c from public.coaching_card where id = p_card;
  if c.id is null or c.educator_id <> auth.uid() or c.status <> 'approved' then raise exception 'card not available'; end if;
  select * into p from public.educator_profile where user_id = auth.uid();
  insert into public.strategy_attempt (org_id, centre_id, educator_id, coaching_card_id, indicator_id, note, photo_path)
  values (p.org_id, p.centre_id, auth.uid(), p_card, c.indicator_id, p_note, p_photo) returning id into v_id;
  return v_id;
end $$;

-- Leader drill-down into an educator's coach chats: allowed, but ALWAYS logged and visible to the educator.
create or replace function public.leader_open_coach_thread(p_thread uuid)
returns table (role text, content text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare t public.coach_thread;
begin
  select * into t from public.coach_thread where id = p_thread;
  if t.id is null or not app.is_leader(app.educator_centre(t.educator_id)) then raise exception 'not allowed'; end if;
  insert into public.audit_log (org_id, actor_id, subject_user_id, action, entity, entity_id)
  values (t.org_id, auth.uid(), t.educator_id, 'view_detail', 'coach_thread', p_thread);
  return query select m.role, m.content, m.created_at from public.coach_message m where m.thread_id = p_thread order by m.created_at;
end $$;

-- ───────────────────────── pathways ─────────────────────────

-- Colleagues who opted in AND were seen at Level 3 on this indicator in the last 180 days.
create or replace function public.peer_matches(p_indicator_code text)
returns table (user_id uuid, full_name text, same_centre boolean, last_seen timestamptz, times_seen int)
language sql stable security definer set search_path = public as $$
  select u.id, u.full_name, (p.centre_id = app.educator_centre(auth.uid())) same_centre, max(o.scheduled_at), count(*)::int
  from public.tag t
  join public.indicator i on i.id = t.indicator_id and i.code = p_indicator_code
  join public.observation o on o.id = t.observation_id and o.status in ('shared','acknowledged','discussed')
  join public.educator_profile p on p.user_id = o.educator_id and p.peer_match_opt_in
  join public.app_user u on u.id = p.user_id
  where t.state = 'accepted' and t.level = 3 and o.scheduled_at > now() - interval '180 days'
    and u.org_id = app.my_org() and u.id <> auth.uid()
  group by u.id, u.full_name, p.centre_id
  order by same_centre desc, count(*) desc, max(o.scheduled_at) desc
  limit 5
$$;

-- ───────────────────────── insights ─────────────────────────

-- Educators × subdomains: most recent accepted level, evidence count, grow count (last 180 days). Leader of the centre only.
create or replace function public.centre_heatmap(p_centre uuid)
returns table (educator_id uuid, full_name text, subdomain_code text, latest_level int, evidence_count int, grow_count int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.is_leader(p_centre) then raise exception 'not allowed'; end if;
  return query
  with t as (
    select o.educator_id, i.subdomain_code, t.level, t.valence, o.scheduled_at,
           row_number() over (partition by o.educator_id, i.subdomain_code order by o.scheduled_at desc, t.created_at desc) rn
    from public.tag t join public.observation o on o.id = t.observation_id
    join public.indicator i on i.id = t.indicator_id
    join public.framework_version fv on fv.id = i.framework_version_id
    join public.framework f on f.id = fv.framework_id and f.code = 'QTT'
    where o.centre_id = p_centre and t.state = 'accepted' and o.status in ('shared','acknowledged','discussed')
      and o.scheduled_at > now() - interval '180 days'
  )
  select p.user_id, u.full_name, t.subdomain_code,
         max(t.level) filter (where t.rn = 1), count(t.*)::int, (count(*) filter (where t.valence = 'grow'))::int
  from public.educator_profile p join public.app_user u on u.id = p.user_id
  join t on t.educator_id = p.user_id
  where p.centre_id = p_centre
  group by p.user_id, u.full_name, t.subdomain_code;
end $$;

create or replace function public.blind_spots(p_centre uuid)
returns table (kind text, code text, name text, educators int)
language plpgsql stable security definer set search_path = public as $$
declare v_edu int;
begin
  if not app.is_leader(p_centre) then raise exception 'not allowed'; end if;
  select count(*) into v_edu from public.educator_profile where centre_id = p_centre and age_group = 'preschool';
  return query
  -- (a) QTT indicators with no evidence in the last 90 days
  select 'no_evidence'::text, i.code, i.name, 0
  from public.indicator i
  join public.framework_version fv on fv.id = i.framework_version_id and fv.status = 'active'
  join public.framework f on f.id = fv.framework_id and f.code = 'QTT'
  where not exists (
    select 1 from public.tag t join public.observation o on o.id = t.observation_id
    where t.indicator_id = i.id and o.centre_id = p_centre and t.state = 'accepted' and o.scheduled_at > now() - interval '90 days')
  union all
  -- (b) shared growth areas: subdomains where ≥ 40% of educators have a Grow in the last 180 days
  select 'shared_growth', i.subdomain_code, min(i.subdomain_name), count(distinct o.educator_id)::int
  from public.tag t join public.observation o on o.id = t.observation_id join public.indicator i on i.id = t.indicator_id
  where o.centre_id = p_centre and t.state = 'accepted' and t.valence = 'grow' and o.scheduled_at > now() - interval '180 days'
    and i.domain_code in ('1','2','3')
  group by i.subdomain_code
  having count(distinct o.educator_id) >= greatest(1, ceil(v_edu * 0.4))
  order by 1, 4 desc, 2;
end $$;

-- HQ: centres × subdomains, aggregated, hiding any group under 5 educators.
create or replace function public.network_heatmap()
returns table (centre_id uuid, centre_name text, subdomain_code text, educators int, growing int, share_growing numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.has_org_role(array['hq','admin']) then raise exception 'not allowed'; end if;
  return query
  with ed as (
    select c.id cid, c.name, count(p.user_id) n from public.centre c join public.educator_profile p on p.centre_id = c.id
    where c.org_id = app.my_org() group by c.id, c.name having count(p.user_id) >= 5
  ), g as (
    select o.centre_id cid, i.subdomain_code sd, count(distinct o.educator_id) growing
    from public.tag t join public.observation o on o.id = t.observation_id join public.indicator i on i.id = t.indicator_id
    where t.state = 'accepted' and t.valence = 'grow' and i.domain_code in ('1','2','3') and o.scheduled_at > now() - interval '180 days'
    group by 1, 2
  ), sds as (select distinct ix.subdomain_code sd from public.indicator ix where ix.domain_code in ('1','2','3'))
  select ed.cid, ed.name, sds.sd, ed.n::int, coalesce(g.growing, 0)::int, round(coalesce(g.growing, 0)::numeric / ed.n, 2)
  from ed cross join sds left join g on g.cid = ed.cid and g.sd = sds.sd
  order by ed.name, sds.sd;
end $$;

-- ───────────────────────── Sandbox metrics (brief KPIs, PRD §3) ─────────────────────────

create or replace function public.sandbox_metrics(p_centre uuid default null, p_baseline_minutes numeric default 90)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_scope uuid[]; v_lna numeric; v_wer numeric; v_doc numeric; v_tag numeric; v_interp numeric; v_strat numeric; v_adopt numeric;
  v_n_lna int; v_n_obs int; v_n_tag int; v_hours numeric;
begin
  if p_centre is not null then
    if not (app.is_leader(p_centre) or app.has_org_role(array['hq','admin'])) then raise exception 'not allowed'; end if;
    v_scope := array[p_centre];
  else
    if not app.has_org_role(array['hq','admin']) then raise exception 'not allowed'; end if;
    select array_agg(id) into v_scope from public.centre where org_id = app.my_org();
  end if;

  select avg((agreement = 'yes')::int), count(*) into v_lna, v_n_lna from public.lna_result where centre_id = any (v_scope) and agreement is not null;
  select avg(transcript_wer) into v_wer from public.observation where centre_id = any (v_scope) and transcript_wer is not null;
  select percentile_cont(0.5) within group (order by review_active_ms / 60000.0), count(*) into v_doc, v_n_obs
    from public.observation where centre_id = any (v_scope) and approved_at is not null and review_active_ms > 0;
  select avg((e.action = 'accept')::int), count(*) into v_tag, v_n_tag
    from public.tag_event e join public.tag t on t.id = e.tag_id join public.observation o on o.id = t.observation_id
    where o.centre_id = any (v_scope) and t.source = 'ai';
  select avg((edit_ratio < 0.15)::int) into v_interp from public.observation where centre_id = any (v_scope) and edit_ratio is not null;
  select count(distinct s.educator_id)::numeric / nullif(count(distinct o.educator_id), 0) into v_strat
    from public.observation o left join public.strategy_attempt s on s.educator_id = o.educator_id
    where o.centre_id = any (v_scope) and o.status in ('shared','acknowledged','discussed');
  select count(distinct u)::numeric / nullif((select count(*) from public.educator_profile where centre_id = any (v_scope)), 0) into v_adopt
    from (
      select r.educator_id u from public.educator_response r join public.observation o on o.id = r.observation_id
        where o.centre_id = any (v_scope) and r.created_at > now() - interval '21 days'
      union select educator_id from public.strategy_attempt where centre_id = any (v_scope) and created_at > now() - interval '21 days'
      union select educator_id from public.reflection where centre_id = any (v_scope) and created_at > now() - interval '21 days'
    ) x;
  select coalesce(sum(greatest(0, p_baseline_minutes - review_active_ms / 60000.0)) / 60, 0) into v_hours
    from public.observation where centre_id = any (v_scope) and approved_at is not null and approved_at > date_trunc('quarter', now());

  return jsonb_build_object(
    'lna_agreement',            jsonb_build_object('value', round(v_lna, 3), 'target', 0.85, 'n', v_n_lna),
    'transcription_accuracy',   jsonb_build_object('value', round(1 - v_wer, 3), 'target', 0.95),
    'documentation_minutes',    jsonb_build_object('value', round(v_doc, 1), 'baseline', p_baseline_minutes,
                                                   'reduction', round(1 - v_doc / p_baseline_minutes, 3), 'target', 0.70, 'n', v_n_obs),
    'tagging_accuracy',         jsonb_build_object('value', round(v_tag, 3), 'target', 0.70, 'n', v_n_tag),
    'interpretation_acceptance',jsonb_build_object('value', round(v_interp, 3), 'target', 0.70),
    'strategy_application',     jsonb_build_object('value', round(v_strat, 3), 'target', 0.70),
    'adoption',                 jsonb_build_object('value', round(v_adopt, 3), 'target', 0.80),
    'hours_saved_this_term',    round(v_hours, 1)
  );
end $$;

grant execute on all functions in schema public to authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;
