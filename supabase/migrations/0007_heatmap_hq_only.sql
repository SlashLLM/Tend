-- PRD "who can see what" (p. 21): the centre heatmap is for HQ (groups of 5+ only); Admin: No.
-- Same function as 0003, with the role check narrowed from hq+admin to hq.
create or replace function public.network_heatmap()
returns table (centre_id uuid, centre_name text, subdomain_code text, educators int, growing int, share_growing numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.has_org_role(array['hq']) then raise exception 'not allowed'; end if;
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
