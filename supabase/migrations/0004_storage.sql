-- Tend · 0004 private media bucket (raw audio/photos may show children → "Restricted" data class).
-- Only the server (service role) reads/writes it; users get short-lived signed URLs after an RLS check.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('capture', 'capture', false, 26214400)
    on conflict (id) do nothing;
  end if;
end $$;

-- Restricted media retention (PRD §11): delete raw media 14 days after approval.
create or replace function public.expire_restricted_media(p_days int default 14)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.capture_item ci set storage_path = null
  from public.observation o
  where o.id = ci.observation_id and ci.storage_path is not null
    and o.approved_at is not null and o.approved_at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.expire_restricted_media(int) from authenticated;

create or replace function public.can_lead_obs_public(p_obs uuid) returns boolean
language sql stable security definer set search_path = public as $$ select app.can_lead_obs(p_obs) $$;
grant execute on function public.can_lead_obs_public(uuid) to authenticated;
