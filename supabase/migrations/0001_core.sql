-- Tend · 0001 core schema
-- Every table carries org_id; centre-scoped tables carry centre_id.
-- Row-level security is on for every table. State changes that matter
-- (scheduling, focus, approval, sharing, tag review) go through
-- SECURITY DEFINER functions, never direct UPDATEs.

create extension if not exists vector;

create schema if not exists app;

-- ───────────────────────── Organisation ─────────────────────────

create table public.organisation (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.centre (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.app_user (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.organisation(id) on delete cascade,
  full_name text not null,
  email text not null,
  locale text not null default 'en' check (locale in ('en','zh','ms','ta')),
  text_scale int not null default 100 check (text_scale between 100 and 130),
  tour_state jsonb not null default '{}'::jsonb,
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.membership (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  user_id uuid not null references public.app_user(id) on delete cascade,
  centre_id uuid references public.centre(id) on delete cascade, -- null for org-wide roles (hq, admin)
  role text not null check (role in ('educator','leader','mentor','hq','admin')),
  created_at timestamptz not null default now(),
  unique (user_id, centre_id, role),
  check ((role in ('hq','admin')) = (centre_id is null))
);

-- ───────────────────────── Frameworks (registry) ─────────────────────────
-- org_id null = global framework (e.g. ECDA QTT) shared by every operator.

create table public.framework (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organisation(id) on delete cascade,
  code text not null,              -- QTT, SFW_EC, EYDF, TRUE
  name text not null,
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create table public.framework_version (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organisation(id) on delete cascade,
  framework_id uuid not null references public.framework(id) on delete cascade,
  version text not null,
  status text not null default 'draft' check (status in ('draft','active','retired')),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (framework_id, version)
);

create table public.indicator (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organisation(id) on delete cascade,
  framework_version_id uuid not null references public.framework_version(id) on delete cascade,
  code text not null,               -- e.g. 3.3.4
  name text not null,
  domain_code text not null,
  domain_name text not null,
  subdomain_code text not null,
  subdomain_name text not null,
  level_descriptors jsonb not null default '{}'::jsonb,  -- {"1": "...", "2": "...", "3": "..."}
  look_fors jsonb not null default '[]'::jsonb,
  age_band text not null default '2-6',
  embedding vector(1536),
  created_at timestamptz not null default now(),
  unique (framework_version_id, code)
);

create table public.occupational_title (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organisation(id) on delete cascade,
  code text not null,
  name text not null,
  age_group text not null check (age_group in ('infant_toddler','preschool','all')),
  unique (org_id, code)
);

create table public.tsc (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organisation(id) on delete cascade,
  framework_version_id uuid not null references public.framework_version(id) on delete cascade,
  code text not null,
  title text not null,
  category text,
  proficiency_levels jsonb not null default '{}'::jsonb,
  unique (framework_version_id, code)
);

create table public.indicator_tsc_map (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organisation(id) on delete cascade,
  indicator_id uuid not null references public.indicator(id) on delete cascade,
  tsc_id uuid not null references public.tsc(id) on delete cascade,
  proficiency_level int not null check (proficiency_level between 1 and 6),
  unique (indicator_id, tsc_id)
);

-- ───────────────────────── People & classes ─────────────────────────

create table public.educator_profile (
  user_id uuid primary key references public.app_user(id) on delete cascade,
  org_id uuid not null references public.organisation(id) on delete cascade,
  centre_id uuid not null references public.centre(id) on delete cascade,
  occupational_title_id uuid references public.occupational_title(id),
  age_group text not null check (age_group in ('infant_toddler','preschool')),
  years_experience int,
  peer_match_opt_in boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.class (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  centre_id uuid not null references public.centre(id) on delete cascade,
  name text not null,
  level text not null check (level in ('IC','PG','N1','N2','K1','K2')),
  parental_media_consent boolean not null default false,
  ambient_audio_consent boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.class_educator (
  class_id uuid not null references public.class(id) on delete cascade,
  user_id uuid not null references public.app_user(id) on delete cascade,
  org_id uuid not null references public.organisation(id) on delete cascade,
  primary key (class_id, user_id)
);

-- Child first names, used ONLY by the redaction step. Leaders + service role only.
create table public.class_roster (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  centre_id uuid not null references public.centre(id) on delete cascade,
  class_id uuid not null references public.class(id) on delete cascade,
  child_name text not null,
  aliases text[] not null default '{}'
);

-- ───────────────────────── Needs analysis ─────────────────────────

create table public.lna_template (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organisation(id) on delete cascade,
  occupational_title_id uuid references public.occupational_title(id),
  age_group text not null check (age_group in ('infant_toddler','preschool')),
  framework_version_id uuid not null references public.framework_version(id),
  questions jsonb not null,
  created_at timestamptz not null default now()
);

create table public.lna_attempt (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  centre_id uuid not null references public.centre(id) on delete cascade,
  educator_id uuid not null references public.app_user(id) on delete cascade,
  template_id uuid not null references public.lna_template(id),
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.lna_answer (
  attempt_id uuid not null references public.lna_attempt(id) on delete cascade,
  org_id uuid not null references public.organisation(id) on delete cascade,
  question_id text not null,
  answer jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

create table public.lna_result (
  attempt_id uuid primary key references public.lna_attempt(id) on delete cascade,
  org_id uuid not null references public.organisation(id) on delete cascade,
  centre_id uuid not null references public.centre(id) on delete cascade,
  educator_id uuid not null references public.app_user(id) on delete cascade,
  strengths jsonb not null,
  growth_areas jsonb not null,
  suggested_goals jsonb not null,
  summary text,
  agreement text check (agreement in ('yes','partly','no')),
  created_at timestamptz not null default now()
);

-- ───────────────────────── IDP ─────────────────────────

create table public.idp (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  centre_id uuid not null references public.centre(id) on delete cascade,
  educator_id uuid not null references public.app_user(id) on delete cascade,
  lineage_id uuid not null default gen_random_uuid(),   -- same across versions
  version int not null default 1,
  status text not null default 'draft' check (status in ('draft','active','superseded')),
  educator_confirmed_at timestamptz,
  leader_confirmed_at timestamptz,
  leader_confirmed_by uuid references public.app_user(id),
  created_by uuid references public.app_user(id),
  created_at timestamptz not null default now(),
  unique (lineage_id, version)
);

create table public.idp_goal (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  idp_id uuid not null references public.idp(id) on delete cascade,
  indicator_id uuid not null references public.indicator(id),
  framework_version_id uuid not null references public.framework_version(id),
  current_level int check (current_level between 1 and 3),
  target_level int not null check (target_level between 1 and 3),
  tsc_id uuid references public.tsc(id),
  review_date date,
  position int not null default 0
);

create table public.pd_activity (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organisation(id) on delete cascade,  -- null = sector catalogue
  centre_id uuid references public.centre(id) on delete cascade,
  tier text not null check (tier in ('peer','internal','micro','course')),
  provider text,
  title text not null,
  mode text,
  hours numeric,
  fee_sgd numeric,
  funding text,
  funded boolean not null default false,
  next_run date,
  url text,
  indicator_codes text[] not null default '{}',
  tsc_codes text[] not null default '{}',
  subdomain_codes text[] not null default '{}',
  level_min int not null default 1,
  level_max int not null default 3,
  source_updated_at date,
  created_at timestamptz not null default now()
);

create table public.idp_action (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  idp_goal_id uuid not null references public.idp_goal(id) on delete cascade,
  description text not null,
  source text not null default 'manual' check (source in ('manual','lna','debrief','pathway','suggestion')),
  status text not null default 'open' check (status in ('proposed','open','done','declined')),
  pd_activity_id uuid references public.pd_activity(id),
  endorsed_by uuid references public.app_user(id),
  created_at timestamptz not null default now()
);

-- ───────────────────────── Observation ─────────────────────────

create table public.observation (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  centre_id uuid not null references public.centre(id) on delete cascade,
  educator_id uuid not null references public.app_user(id) on delete cascade,
  observer_id uuid not null references public.app_user(id),
  class_id uuid references public.class(id),
  framework_version_id uuid references public.framework_version(id),
  title text,
  scheduled_at timestamptz not null,
  duration_min int not null default 20 check (duration_min between 5 and 90),
  status text not null default 'scheduled' check (status in
    ('scheduled','capturing','processing','ai_draft','in_review','shared','acknowledged','discussed','rejected','cancelled')),
  pipeline_step text,
  focus_goal_ids uuid[] not null default '{}',
  focus_note text,
  focus_set_at timestamptz,
  capture_started_at timestamptz,
  capture_ended_at timestamptz,
  review_active_ms bigint not null default 0,
  approved_by uuid references public.app_user(id),
  approved_at timestamptz,
  edit_ratio numeric check (edit_ratio between 0 and 1),
  shared_at timestamptz,
  created_at timestamptz not null default now(),
  check (cardinality(focus_goal_ids) <= 2)
);

create table public.capture_item (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  observation_id uuid not null references public.observation(id) on delete cascade,
  kind text not null check (kind in ('audio_chunk','photo','note','moment','video')),
  seq int not null,
  t_offset_ms int not null default 0,
  storage_path text,
  text text,
  transcript text,
  created_at timestamptz not null default now(),
  unique (observation_id, kind, seq)
);

create table public.evidence_unit (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  observation_id uuid not null references public.observation(id) on delete cascade,
  idx int not null,
  text text not null,
  start_ms int not null default 0,
  end_ms int not null default 0,
  capture_item_ids uuid[] not null default '{}',
  embedding vector(1536),
  unique (observation_id, idx)
);

create table public.tag (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  observation_id uuid not null references public.observation(id) on delete cascade,
  evidence_unit_id uuid references public.evidence_unit(id) on delete cascade,
  indicator_id uuid not null references public.indicator(id),
  framework_version_id uuid not null references public.framework_version(id),
  level int not null check (level between 1 and 3),
  valence text not null check (valence in ('glow','grow')),
  confidence numeric not null default 1 check (confidence between 0 and 1),
  reason text,
  source text not null default 'ai' check (source in ('ai','leader')),
  state text not null default 'suggested' check (state in ('suggested','accepted','rejected')),
  changed_by_leader boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.tag_event (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  tag_id uuid not null references public.tag(id) on delete cascade,
  actor_id uuid not null references public.app_user(id),
  action text not null check (action in ('accept','reject','add','change_level')),
  from_level int,
  to_level int,
  created_at timestamptz not null default now()
);

-- Feedback narrative, versioned. content = {glows:[{text,evidence_ids}], grows:[…], next_step:{text,evidence_ids,goal_id}}
create table public.narrative (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  observation_id uuid not null references public.observation(id) on delete cascade,
  version int not null,
  author text not null check (author in ('ai','leader')),
  content jsonb not null,
  is_final boolean not null default false,
  created_by uuid references public.app_user(id),
  created_at timestamptz not null default now(),
  unique (observation_id, version)
);

create table public.educator_response (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  observation_id uuid not null references public.observation(id) on delete cascade,
  educator_id uuid not null references public.app_user(id) on delete cascade,
  kind text not null check (kind in ('reflection','agree','context','thumbs')),
  target_ref text,      -- e.g. "grow:0"
  body text,
  value text,           -- up/down for thumbs
  audio_path text,
  created_at timestamptz not null default now()
);

create table public.debrief (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  observation_id uuid not null unique references public.observation(id) on delete cascade,
  agenda jsonb,
  notes text,
  started_at timestamptz,
  completed_at timestamptz
);

-- ───────────────────────── Coaching ─────────────────────────

create table public.coaching_card (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  observation_id uuid references public.observation(id) on delete cascade,
  educator_id uuid references public.app_user(id) on delete cascade,
  indicator_id uuid references public.indicator(id),
  title text not null,
  body jsonb not null,   -- {why, try_tomorrow, say_it, adapt_by_age, reflect_after}
  status text not null default 'draft' check (status in ('draft','approved','dismissed')),
  created_at timestamptz not null default now()
);

create table public.coach_thread (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  educator_id uuid not null references public.app_user(id) on delete cascade,
  idp_goal_id uuid references public.idp_goal(id) on delete set null,
  title text,
  created_at timestamptz not null default now()
);

create table public.coach_message (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  thread_id uuid not null references public.coach_thread(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  flagged text,
  created_at timestamptz not null default now()
);

create table public.coach_digest (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  centre_id uuid not null references public.centre(id) on delete cascade,
  educator_id uuid not null references public.app_user(id) on delete cascade,
  week_start date not null,
  themes jsonb not null,
  created_at timestamptz not null default now(),
  unique (educator_id, week_start)
);

create table public.reflection (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  centre_id uuid not null references public.centre(id) on delete cascade,
  educator_id uuid not null references public.app_user(id) on delete cascade,
  observation_id uuid references public.observation(id) on delete set null,
  visibility text not null default 'private' check (visibility in ('private','shared')),
  body text not null,
  audio_path text,
  created_at timestamptz not null default now()
);

create table public.strategy_attempt (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  centre_id uuid not null references public.centre(id) on delete cascade,
  educator_id uuid not null references public.app_user(id) on delete cascade,
  coaching_card_id uuid references public.coaching_card(id) on delete set null,
  indicator_id uuid references public.indicator(id),
  note text,
  photo_path text,
  tried_on date not null default current_date,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Pathways ─────────────────────────

create table public.recommendation (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  idp_goal_id uuid not null references public.idp_goal(id) on delete cascade,
  pd_activity_id uuid references public.pd_activity(id) on delete cascade,
  peer_user_id uuid references public.app_user(id) on delete cascade,
  score numeric not null,
  reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.plc (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  centre_id uuid not null references public.centre(id) on delete cascade,
  name text not null,
  indicator_id uuid references public.indicator(id),
  member_ids uuid[] not null default '{}',
  lead_ids uuid[] not null default '{}',
  pd_activity_id uuid references public.pd_activity(id),
  starts_on date,
  weeks int,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Trust & metrics ─────────────────────────

create table public.ai_run (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organisation(id) on delete cascade,
  task text not null,
  provider text not null,
  model text not null,
  region text,
  prompt_version text not null,
  input_tokens int,
  cached_input_tokens int,
  output_tokens int,
  cost_usd numeric,
  latency_ms int,
  observation_id uuid references public.observation(id) on delete set null,
  ok boolean not null,
  error text,
  created_at timestamptz not null default now()
);

create table public.feedback_event (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  centre_id uuid references public.centre(id) on delete cascade,
  user_id uuid not null references public.app_user(id) on delete cascade,
  kind text not null,        -- lna_agree, feedback_thumbs, tour_complete, ...
  ref_id uuid,
  value text,
  created_at timestamptz not null default now()
);

create table public.consent (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  user_id uuid not null references public.app_user(id) on delete cascade,
  kind text not null check (kind in ('ai_processing_notice','peer_match','summary_share')),
  version text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organisation(id) on delete cascade,
  actor_id uuid,
  subject_user_id uuid,
  action text not null,     -- view, update, approve, share, export, ...
  entity text not null,
  entity_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);

create table public.notification (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  user_id uuid not null references public.app_user(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.metric_snapshot (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisation(id) on delete cascade,
  centre_id uuid references public.centre(id) on delete cascade,
  metric text not null,
  value numeric not null,
  captured_at timestamptz not null default now()
);

-- Useful indexes
create index on public.membership (user_id);
create index on public.observation (centre_id, status);
create index on public.observation (educator_id);
create index on public.tag (observation_id);
create index on public.tag (indicator_id, state);
create index on public.narrative (observation_id);
create index on public.educator_response (observation_id, kind);
create index on public.audit_log (subject_user_id);
