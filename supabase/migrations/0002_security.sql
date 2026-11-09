-- Tend · 0002 security: helpers, RLS policies, grants, state-change functions.
--
-- Principles
--   * Everything is scoped to the caller's organisation.
--   * Educators see their own records; leaders see their centre.
--   * APPROVAL GATE: educators can read AI-written content only after a leader
--     has approved & shared it AND the educator has submitted a reflection.
--   * PRIVATE REFLECTIONS are owner-only. There is no leader policy at all.
--   * Observation state changes only happen through SECURITY DEFINER functions.
--   * audit_log is append-only.

-- ───────────────────────── helpers ─────────────────────────

create or replace function app.uid() returns uuid
language sql stable as $$ select auth.uid() $$;

create or replace function app.my_org() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.app_user where id = auth.uid()
$$;

create or replace function app.has_centre_role(p_centre uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.membership m
    where m.user_id = auth.uid() and m.centre_id = p_centre and m.role = any (p_roles)
  )
$$;

create or replace function app.is_leader(p_centre uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.has_centre_role(p_centre, array['leader'])
$$;

create or replace function app.has_org_role(p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.membership m
    where m.user_id = auth.uid() and m.centre_id is null
      and m.role = any (p_roles) and m.org_id = app.my_org()
  )
$$;

create or replace function app.educator_centre(p_user uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select centre_id from public.educator_profile where user_id = p_user
$$;

create or replace function app.obs_centre(p_obs uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select centre_id from public.observation where id = p_obs
$$;

create or replace function app.can_lead_obs(p_obs uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.observation o
    where o.id = p_obs and (app.is_leader(o.centre_id) or o.observer_id = auth.uid())
  )
$$;

-- The approval gate + reflect-first rule, in one place.
create or replace function app.feedback_visible_to_me(p_obs uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.observation o
    where o.id = p_obs
      and o.educator_id = auth.uid()
      and o.status in ('shared','acknowledged','discussed')
      and exists (
        select 1 from public.educator_response r
        where r.observation_id = o.id and r.educator_id = auth.uid() and r.kind = 'reflection'
      )
  )
$$;

create or replace function app.is_my_obs_shared(p_obs uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.observation o
    where o.id = p_obs and o.educator_id = auth.uid()
      and o.status in ('shared','acknowledged','discussed')
  )
$$;

create or replace function app.idp_owner(p_idp uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select educator_id from public.idp where id = p_idp
$$;

create or replace function app.idp_centre(p_idp uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select centre_id from public.idp where id = p_idp
$$;

create or replace function app.goal_idp(p_goal uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select idp_id from public.idp_goal where id = p_goal
$$;

create or replace function app.can_see_idp(p_idp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.idp_owner(p_idp) = auth.uid() or app.is_leader(app.idp_centre(p_idp))
$$;

-- ───────────────────────── grants ─────────────────────────

grant usage on schema public to authenticated, service_role;
grant usage on schema app to authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;
grant select on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Direct writes allowed (row-level policies further restrict them).
grant update (locale, text_scale, tour_state, onboarded_at, full_name) on public.app_user to authenticated;
grant update (peer_match_opt_in) on public.educator_profile to authenticated;
grant insert, update on public.lna_attempt to authenticated;
grant insert, update on public.lna_answer to authenticated;
grant update (agreement) on public.lna_result to authenticated;
grant insert on public.idp to authenticated;
grant insert, update, delete on public.idp_goal to authenticated;
grant insert, update on public.idp_action to authenticated;
grant insert on public.capture_item to authenticated;
grant insert on public.narrative to authenticated;
grant insert, update on public.debrief to authenticated;
grant insert on public.coach_thread, public.coach_message to authenticated;
grant insert, update, delete on public.reflection to authenticated;
grant insert on public.strategy_attempt to authenticated;
grant insert, update on public.plc to authenticated;
grant insert on public.feedback_event to authenticated;
grant insert, update (revoked_at) on public.consent to authenticated;
grant update (read_at) on public.notification to authenticated;
grant insert, update, delete on public.framework, public.framework_version, public.indicator,
  public.tsc, public.indicator_tsc_map, public.occupational_title, public.lna_template, public.pd_activity to authenticated;

-- audit_log: append-only for everyone (service role included).
revoke update, delete, truncate on public.audit_log from authenticated, service_role;
create or replace function app.audit_log_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function app.audit_log_immutable();

-- ───────────────────────── enable RLS everywhere ─────────────────────────

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ───────────────────────── policies ─────────────────────────

-- organisation / centre / users
create policy org_read on public.organisation for select to authenticated using (id = app.my_org());
create policy centre_read on public.centre for select to authenticated using (org_id = app.my_org());
create policy user_read on public.app_user for select to authenticated using (org_id = app.my_org());
create policy user_update_self on public.app_user for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy membership_read on public.membership for select to authenticated using (org_id = app.my_org());

-- registry: global (org_id null) readable by all; org-owned editable by hq/admin
do $$
declare t text;
begin
  foreach t in array array['framework','framework_version','indicator','tsc','indicator_tsc_map',
                           'occupational_title','lna_template','pd_activity'] loop
    execute format($f$create policy %1$s_read on public.%1$I for select to authenticated
      using (org_id is null or org_id = app.my_org())$f$, t);
    execute format($f$create policy %1$s_write on public.%1$I for all to authenticated
      using (org_id = app.my_org() and app.has_org_role(array['hq','admin']))
      with check (org_id = app.my_org() and app.has_org_role(array['hq','admin']))$f$, t);
  end loop;
end $$;

-- people & classes
create policy profile_read on public.educator_profile for select to authenticated using (org_id = app.my_org());
create policy profile_update_self on public.educator_profile for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy class_read on public.class for select to authenticated using (org_id = app.my_org());
create policy class_educator_read on public.class_educator for select to authenticated using (org_id = app.my_org());
create policy roster_leader on public.class_roster for select to authenticated using (app.is_leader(centre_id));

-- needs analysis
create policy lna_attempt_own on public.lna_attempt for all to authenticated
  using (educator_id = auth.uid()) with check (educator_id = auth.uid() and org_id = app.my_org());
create policy lna_attempt_leader on public.lna_attempt for select to authenticated using (app.is_leader(centre_id));
create policy lna_answer_own on public.lna_answer for all to authenticated
  using (exists (select 1 from public.lna_attempt a where a.id = attempt_id and a.educator_id = auth.uid()))
  with check (exists (select 1 from public.lna_attempt a where a.id = attempt_id and a.educator_id = auth.uid()
                      and a.status = 'in_progress'));
create policy lna_answer_leader on public.lna_answer for select to authenticated
  using (exists (select 1 from public.lna_attempt a where a.id = attempt_id and app.is_leader(a.centre_id)));
create policy lna_result_own on public.lna_result for select to authenticated using (educator_id = auth.uid());
create policy lna_result_own_agree on public.lna_result for update to authenticated
  using (educator_id = auth.uid()) with check (educator_id = auth.uid());
create policy lna_result_leader on public.lna_result for select to authenticated using (app.is_leader(centre_id));

-- IDP
create policy idp_read on public.idp for select to authenticated
  using (educator_id = auth.uid() or app.is_leader(centre_id));
create policy idp_insert on public.idp for insert to authenticated
  with check (org_id = app.my_org() and status = 'draft'
              and educator_confirmed_at is null and leader_confirmed_at is null
              and (educator_id = auth.uid() or app.is_leader(centre_id)));
create policy idp_goal_read on public.idp_goal for select to authenticated using (app.can_see_idp(idp_id));
create policy idp_goal_write on public.idp_goal for all to authenticated
  using (app.can_see_idp(idp_id) and exists (select 1 from public.idp i where i.id = idp_id and i.status = 'draft'))
  with check (app.can_see_idp(idp_id) and exists (select 1 from public.idp i where i.id = idp_id and i.status = 'draft'));
create policy idp_action_read on public.idp_action for select to authenticated
  using (app.can_see_idp(app.goal_idp(idp_goal_id)));
create policy idp_action_write on public.idp_action for all to authenticated
  using (app.can_see_idp(app.goal_idp(idp_goal_id)))
  with check (app.can_see_idp(app.goal_idp(idp_goal_id)));

-- Only leaders may endorse an action.
create or replace function app.guard_idp_action() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;  -- service role / seed
  if new.endorsed_by is distinct from (case when tg_op = 'UPDATE' then old.endorsed_by else null end) then
    if not app.is_leader(app.idp_centre(app.goal_idp(new.idp_goal_id))) or new.endorsed_by <> auth.uid() then
      raise exception 'only a centre leader can endorse an action';
    end if;
  end if;
  return new;
end $$;
create trigger idp_action_guard before insert or update on public.idp_action
  for each row execute function app.guard_idp_action();

-- observation (read only — writes via functions)
create policy obs_read on public.observation for select to authenticated
  using (educator_id = auth.uid() or observer_id = auth.uid() or app.is_leader(centre_id));

-- raw capture: leader / observer only, never the educator
create policy capture_read on public.capture_item for select to authenticated using (app.can_lead_obs(observation_id));
create policy capture_insert on public.capture_item for insert to authenticated
  with check (app.can_lead_obs(observation_id)
              and exists (select 1 from public.observation o where o.id = observation_id and o.status = 'capturing'));

-- evidence / tags / narrative: leader always; educator only through the gate
create policy evidence_leader on public.evidence_unit for select to authenticated using (app.can_lead_obs(observation_id));
create policy evidence_educator on public.evidence_unit for select to authenticated using (app.feedback_visible_to_me(observation_id));

create policy tag_leader on public.tag for select to authenticated using (app.can_lead_obs(observation_id));
create policy tag_educator on public.tag for select to authenticated
  using (state = 'accepted' and app.feedback_visible_to_me(observation_id));
create policy tag_event_leader on public.tag_event for select to authenticated
  using (exists (select 1 from public.tag t where t.id = tag_id and app.can_lead_obs(t.observation_id)));

create policy narrative_leader on public.narrative for select to authenticated using (app.can_lead_obs(observation_id));
create policy narrative_leader_edit on public.narrative for insert to authenticated
  with check (author = 'leader' and is_final = false and created_by = auth.uid()
              and app.can_lead_obs(observation_id)
              and exists (select 1 from public.observation o where o.id = observation_id
                          and o.status in ('ai_draft','in_review')));
create policy narrative_educator on public.narrative for select to authenticated
  using (is_final and app.feedback_visible_to_me(observation_id));

-- educator responses (reflection is visible to the leader for the debrief)
create policy response_own on public.educator_response for select to authenticated using (educator_id = auth.uid());
create policy response_leader on public.educator_response for select to authenticated using (app.can_lead_obs(observation_id));

create policy debrief_leader on public.debrief for all to authenticated
  using (app.can_lead_obs(observation_id)) with check (app.can_lead_obs(observation_id));
create policy debrief_educator on public.debrief for select to authenticated using (app.feedback_visible_to_me(observation_id));

-- coaching
create policy card_educator on public.coaching_card for select to authenticated
  using (educator_id = auth.uid() and status = 'approved'
         and (observation_id is null or app.feedback_visible_to_me(observation_id)));
create policy card_leader on public.coaching_card for select to authenticated
  using (app.is_leader(app.educator_centre(educator_id)));

create policy thread_own on public.coach_thread for all to authenticated
  using (educator_id = auth.uid()) with check (educator_id = auth.uid() and org_id = app.my_org());
create policy message_own on public.coach_message for all to authenticated
  using (exists (select 1 from public.coach_thread t where t.id = thread_id and t.educator_id = auth.uid()))
  with check (role = 'user' and exists (select 1 from public.coach_thread t where t.id = thread_id and t.educator_id = auth.uid()));

create policy digest_leader on public.coach_digest for select to authenticated using (app.is_leader(centre_id));
create policy digest_own on public.coach_digest for select to authenticated using (educator_id = auth.uid());

-- reflections: private ones are owner-only; there is deliberately no other policy for them
create policy reflection_own on public.reflection for all to authenticated
  using (educator_id = auth.uid()) with check (educator_id = auth.uid() and org_id = app.my_org());
create policy reflection_shared_leader on public.reflection for select to authenticated
  using (visibility = 'shared' and app.is_leader(centre_id));

create policy attempt_own on public.strategy_attempt for all to authenticated
  using (educator_id = auth.uid()) with check (educator_id = auth.uid() and org_id = app.my_org());
create policy attempt_leader on public.strategy_attempt for select to authenticated using (app.is_leader(centre_id));

-- pathways
create policy reco_read on public.recommendation for select to authenticated
  using (app.can_see_idp(app.goal_idp(idp_goal_id)));
create policy plc_leader on public.plc for all to authenticated
  using (app.is_leader(centre_id)) with check (app.is_leader(centre_id));
create policy plc_member on public.plc for select to authenticated using (auth.uid() = any (member_ids));

-- trust & metrics
create policy ai_run_admin on public.ai_run for select to authenticated
  using (org_id = app.my_org() and app.has_org_role(array['hq','admin']));
create policy fe_own on public.feedback_event for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and org_id = app.my_org());
create policy fe_leader on public.feedback_event for select to authenticated using (app.is_leader(centre_id));
create policy consent_own on public.consent for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and org_id = app.my_org());
create policy audit_subject on public.audit_log for select to authenticated using (subject_user_id = auth.uid());
create policy audit_admin on public.audit_log for select to authenticated
  using (org_id = app.my_org() and app.has_org_role(array['admin']));
create policy notif_own on public.notification for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy metric_leader on public.metric_snapshot for select to authenticated
  using (app.is_leader(centre_id) or (org_id = app.my_org() and app.has_org_role(array['hq','admin'])));

-- ───────────────────────── audit helper ─────────────────────────

create or replace function public.log_access(p_subject uuid, p_entity text, p_entity_id uuid, p_action text default 'view', p_detail jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (org_id, actor_id, subject_user_id, action, entity, entity_id, detail)
  values (app.my_org(), auth.uid(), p_subject, p_action, p_entity, p_entity_id, p_detail);
end $$;

-- ───────────────────────── observation lifecycle ─────────────────────────

create or replace function public.schedule_observation(
  p_educator uuid, p_scheduled_at timestamptz, p_duration_min int default 20,
  p_class uuid default null, p_title text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_centre uuid; v_id uuid; v_fv uuid;
begin
  v_centre := app.educator_centre(p_educator);
  if v_centre is null then raise exception 'educator has no centre'; end if;
  if not app.is_leader(v_centre) then raise exception 'only a centre leader can schedule observations'; end if;
  select fv.id into v_fv from public.framework_version fv join public.framework f on f.id = fv.framework_id
   where f.code = 'QTT' and fv.status = 'active' order by fv.activated_at desc nulls last limit 1;
  insert into public.observation (org_id, centre_id, educator_id, observer_id, class_id, scheduled_at,
                                  duration_min, title, framework_version_id)
  values (app.my_org(), v_centre, p_educator, auth.uid(), p_class, p_scheduled_at, p_duration_min, p_title, v_fv)
  returning id into v_id;
  insert into public.notification (org_id, user_id, kind, payload)
  values (app.my_org(), p_educator, 'observation_scheduled', jsonb_build_object('observation_id', v_id));
  return v_id;
end $$;

create or replace function public.set_observation_focus(p_obs uuid, p_goal_ids uuid[], p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o public.observation;
begin
  select * into o from public.observation where id = p_obs for update;
  if o.id is null or o.educator_id <> auth.uid() then raise exception 'not your observation'; end if;
  if o.status <> 'scheduled' then raise exception 'focus can only be set before the observation starts'; end if;
  if coalesce(cardinality(p_goal_ids), 0) > 2 then raise exception 'pick at most 2 focus goals'; end if;
  if exists (
    select 1 from unnest(coalesce(p_goal_ids, '{}')) g(id)
    where not exists (select 1 from public.idp_goal ig join public.idp i on i.id = ig.idp_id
                      where ig.id = g.id and i.educator_id = auth.uid())
  ) then raise exception 'focus goals must come from your own IDP'; end if;
  update public.observation set focus_goal_ids = coalesce(p_goal_ids, '{}'), focus_note = p_note, focus_set_at = now()
   where id = p_obs;
end $$;

create or replace function public.start_capture(p_obs uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.can_lead_obs(p_obs) then raise exception 'not allowed'; end if;
  update public.observation set status = 'capturing', capture_started_at = coalesce(capture_started_at, now())
   where id = p_obs and status in ('scheduled','capturing');
  if not found then raise exception 'observation cannot start capture from its current status'; end if;
end $$;

create or replace function public.end_capture(p_obs uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.can_lead_obs(p_obs) then raise exception 'not allowed'; end if;
  update public.observation set status = 'processing', capture_ended_at = now(), pipeline_step = 'queued'
   where id = p_obs and status = 'capturing';
  if not found then raise exception 'observation is not capturing'; end if;
end $$;

create or replace function public.begin_review(p_obs uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.can_lead_obs(p_obs) then raise exception 'not allowed'; end if;
  update public.observation set status = 'in_review' where id = p_obs and status in ('ai_draft','in_review');
  if not found then raise exception 'no draft to review'; end if;
end $$;

create or replace function public.review_tag(p_tag uuid, p_action text, p_level int default null)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tag; v_status text;
begin
  select * into t from public.tag where id = p_tag for update;
  if t.id is null or not app.can_lead_obs(t.observation_id) then raise exception 'not allowed'; end if;
  select status into v_status from public.observation where id = t.observation_id;
  if v_status not in ('ai_draft','in_review') then raise exception 'tags are locked after sharing'; end if;
  if p_action = 'accept' then
    update public.tag set state = 'accepted' where id = p_tag;
  elsif p_action = 'reject' then
    update public.tag set state = 'rejected', changed_by_leader = true where id = p_tag;
  elsif p_action = 'change_level' then
    if p_level not between 1 and 3 then raise exception 'level must be 1–3'; end if;
    update public.tag set level = p_level, state = 'accepted', changed_by_leader = true where id = p_tag;
  else
    raise exception 'unknown action %', p_action;
  end if;
  insert into public.tag_event (org_id, tag_id, actor_id, action, from_level, to_level)
  values (t.org_id, p_tag, auth.uid(), p_action, t.level, coalesce(p_level, t.level));
end $$;

create or replace function public.add_tag(p_obs uuid, p_indicator uuid, p_level int, p_valence text,
                                          p_evidence uuid default null, p_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_org uuid; v_fv uuid; v_status text;
begin
  if not app.can_lead_obs(p_obs) then raise exception 'not allowed'; end if;
  select org_id, status into v_org, v_status from public.observation where id = p_obs;
  if v_status not in ('ai_draft','in_review') then raise exception 'tags are locked after sharing'; end if;
  select framework_version_id into v_fv from public.indicator where id = p_indicator;
  insert into public.tag (org_id, observation_id, evidence_unit_id, indicator_id, framework_version_id, level,
                          valence, confidence, reason, source, state, changed_by_leader)
  values (v_org, p_obs, p_evidence, p_indicator, v_fv, p_level, p_valence, 1, p_reason, 'leader', 'accepted', true)
  returning id into v_id;
  insert into public.tag_event (org_id, tag_id, actor_id, action, to_level) values (v_org, v_id, auth.uid(), 'add', p_level);
  return v_id;
end $$;

-- THE APPROVAL GATE. Nothing AI-written reaches an educator except through here.
create or replace function public.approve_and_share(p_obs uuid, p_content jsonb, p_edit_ratio numeric,
                                                    p_review_active_ms bigint default 0)
returns void language plpgsql security definer set search_path = public as $$
declare o public.observation; v_next int;
begin
  select * into o from public.observation where id = p_obs for update;
  if o.id is null then raise exception 'observation not found'; end if;
  if not app.is_leader(o.centre_id) then raise exception 'only a centre leader can approve'; end if;
  if o.status not in ('ai_draft','in_review') then raise exception 'nothing to approve (status %)', o.status; end if;
  if p_content is null or jsonb_typeof(p_content -> 'glows') <> 'array' or jsonb_typeof(p_content -> 'grows') <> 'array'
     or p_content -> 'next_step' is null then
    raise exception 'feedback must contain glows, grows and a next_step';
  end if;
  if p_edit_ratio is null or p_edit_ratio < 0 or p_edit_ratio > 1 then raise exception 'edit_ratio must be 0–1'; end if;

  select coalesce(max(version), 0) + 1 into v_next from public.narrative where observation_id = p_obs;
  update public.narrative set is_final = false where observation_id = p_obs;
  insert into public.narrative (org_id, observation_id, version, author, content, is_final, created_by)
  values (o.org_id, p_obs, v_next, 'leader', p_content, true, auth.uid());

  -- Untouched AI suggestions: confident ones (shown ticked) are accepted, "possible" ones (<0.55) are dropped.
  update public.tag set state = case when confidence >= 0.55 then 'accepted' else 'rejected' end
   where observation_id = p_obs and state = 'suggested';
  update public.coaching_card set status = 'approved' where observation_id = p_obs and status = 'draft';

  update public.observation
     set status = 'shared', approved_by = auth.uid(), approved_at = now(), shared_at = now(),
         edit_ratio = p_edit_ratio, review_active_ms = review_active_ms + coalesce(p_review_active_ms, 0)
   where id = p_obs;

  insert into public.notification (org_id, user_id, kind, payload)
  values (o.org_id, o.educator_id, 'feedback_shared', jsonb_build_object('observation_id', p_obs));
  insert into public.audit_log (org_id, actor_id, subject_user_id, action, entity, entity_id, detail)
  values (o.org_id, auth.uid(), o.educator_id, 'approve_share', 'observation', p_obs,
          jsonb_build_object('edit_ratio', p_edit_ratio));
end $$;

create or replace function public.reject_observation(p_obs uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_leader(app.obs_centre(p_obs)) then raise exception 'only a centre leader can reject'; end if;
  update public.observation set status = 'rejected' where id = p_obs and status in ('ai_draft','in_review');
  if not found then raise exception 'nothing to reject'; end if;
end $$;

-- Educator: reflect FIRST (unlocks the feedback), then respond.
create or replace function public.submit_reflection(p_obs uuid, p_body text, p_audio_path text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.observation; v_id uuid;
begin
  select * into o from public.observation where id = p_obs;
  if o.id is null or o.educator_id <> auth.uid() then raise exception 'not your observation'; end if;
  if o.status not in ('shared','acknowledged','discussed') then raise exception 'feedback has not been shared yet'; end if;
  if coalesce(length(trim(p_body)), 0) = 0 and p_audio_path is null then raise exception 'reflection is empty'; end if;
  if exists (select 1 from public.educator_response where observation_id = p_obs and kind = 'reflection') then
    raise exception 'reflection already submitted';
  end if;
  insert into public.educator_response (org_id, observation_id, educator_id, kind, body, audio_path)
  values (o.org_id, p_obs, auth.uid(), 'reflection', p_body, p_audio_path) returning id into v_id;
  return v_id;
end $$;

create or replace function public.respond_to_feedback(p_obs uuid, p_kind text, p_target text default null,
                                                      p_body text default null, p_value text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.observation; v_id uuid;
begin
  if p_kind not in ('agree','context','thumbs') then raise exception 'unknown response kind'; end if;
  select * into o from public.observation where id = p_obs;
  if o.id is null or o.educator_id <> auth.uid() then raise exception 'not your observation'; end if;
  if not app.feedback_visible_to_me(p_obs) then raise exception 'reflect first, then respond'; end if;
  if p_kind = 'thumbs' and p_value not in ('up','down') then raise exception 'thumbs must be up or down'; end if;
  if p_kind = 'context' and coalesce(length(trim(p_body)), 0) = 0 then raise exception 'context is empty'; end if;
  insert into public.educator_response (org_id, observation_id, educator_id, kind, target_ref, body, value)
  values (o.org_id, p_obs, auth.uid(), p_kind, p_target, p_body, p_value) returning id into v_id;
  update public.observation set status = 'acknowledged' where id = p_obs and status = 'shared';
  return v_id;
end $$;

-- ───────────────────────── IDP confirmation ─────────────────────────

create or replace function public.confirm_idp(p_idp uuid) returns text
language plpgsql security definer set search_path = public as $$
declare i public.idp; v_is_owner boolean; v_is_leader boolean;
begin
  select * into i from public.idp where id = p_idp for update;
  if i.id is null then raise exception 'IDP not found'; end if;
  v_is_owner := i.educator_id = auth.uid();
  v_is_leader := app.is_leader(i.centre_id);
  if not (v_is_owner or v_is_leader) then raise exception 'not allowed'; end if;
  if i.status <> 'draft' then raise exception 'only a draft IDP can be confirmed'; end if;
  if not exists (select 1 from public.idp_goal where idp_id = p_idp) then raise exception 'IDP needs at least one goal'; end if;
  if (select count(*) from public.idp_goal where idp_id = p_idp) > 3 then raise exception 'IDP has at most 3 goals'; end if;

  if v_is_owner then update public.idp set educator_confirmed_at = now() where id = p_idp; end if;
  if v_is_leader and not v_is_owner then
    update public.idp set leader_confirmed_at = now(), leader_confirmed_by = auth.uid() where id = p_idp;
  end if;

  select * into i from public.idp where id = p_idp;
  if i.educator_confirmed_at is not null and i.leader_confirmed_at is not null then
    update public.idp set status = 'superseded' where lineage_id = i.lineage_id and status = 'active';
    update public.idp set status = 'active' where id = p_idp;
    return 'active';
  end if;
  return 'draft';
end $$;

grant execute on all functions in schema public to authenticated, service_role;
