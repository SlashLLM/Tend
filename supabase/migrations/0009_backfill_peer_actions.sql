-- Tend · 0009 link Peer Match actions created before 0008 to the colleague they name, so they can use the
-- ask → book → reflect flow. Matches the exact text Learn writes ("Watch <full name> for 15 minutes") to an
-- opted-in educator in the same organisation. Finished actions are left alone.
update public.idp_action a
   set peer_user_id = u.id
  from public.app_user u
  join public.educator_profile p on p.user_id = u.id and p.peer_match_opt_in
 where a.peer_user_id is null
   and a.status in ('proposed', 'open')
   and u.org_id = a.org_id
   and a.description = 'Watch ' || u.full_name || ' for 15 minutes'
   and u.id <> app.idp_owner(app.goal_idp(a.idp_goal_id));
