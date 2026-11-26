-- Real programmes catalogue synced from SkillsFuture open data (data.gov.sg), with AI-suggested
-- framework tags that HQ approves before a course is recommended to educators.

alter table public.pd_activity
  add column source text not null default 'manual' check (source in ('seed', 'skillsfuture', 'manual')),
  add column source_ref text,
  add column status text not null default 'active' check (status in ('active', 'pending_review', 'retired')),
  add column fee_after_subsidy_sgd numeric,
  add column description text,
  add column tag_suggestion jsonb,
  add column tagged_by text check (tagged_by in ('ai', 'hq')),
  add column reviewed_by uuid references public.app_user(id) on delete set null,
  add column reviewed_at timestamptz;

-- Everything that exists before the first sync came from the demo seed.
update public.pd_activity set source = 'seed';

-- One row per external course: the sync upserts on this.
-- (Not partial: PostgREST upserts need a plain unique index. NULL source_refs never collide.)
create unique index pd_activity_source_ref on public.pd_activity (source, source_ref);
create index pd_activity_status on public.pd_activity (status);

create table public.catalogue_sync_run (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organisation(id) on delete cascade,  -- null = sector catalogue sync
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null check (trigger in ('cron', 'manual', 'cli')),
  ok boolean,
  fetched int not null default 0,
  inserted int not null default 0,
  updated int not null default 0,
  retired int not null default 0,
  tagged int not null default 0,
  source_updated_at date,
  error text
);

alter table public.catalogue_sync_run enable row level security;
grant select on public.catalogue_sync_run to authenticated;
create policy catalogue_sync_run_read on public.catalogue_sync_run for select to authenticated
  using (app.has_org_role(array['hq', 'admin']));
