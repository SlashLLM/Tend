import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActionView } from '@/lib/peer';

export type GoalView = {
  id: string;
  current_level: number | null;
  target_level: number;
  review_date: string | null;
  position: number;
  indicator: { id: string; code: string; name: string; subdomain_name: string; level_descriptors: Record<string, string>; look_fors: string[] };
  tsc: { code: string; title: string } | null;
  actions: ActionView[];
};
export type { ActionView, PeerSessionView } from '@/lib/peer';

export type IdpView = {
  id: string;
  lineage_id: string;
  version: number;
  status: 'draft' | 'active' | 'superseded';
  educator_id: string;
  centre_id: string;
  educator_confirmed_at: string | null;
  leader_confirmed_at: string | null;
  goals: GoalView[];
};

const GOAL_SELECT =
  'id, current_level, target_level, review_date, position, indicator:indicator_id(id, code, name, subdomain_name, level_descriptors, look_fors), tsc:tsc_id(code, title), actions:idp_action(id, description, status, source, endorsed_by, pd_activity_id, peer_user_id, completed_at, completion_note, cpd_minutes, created_at, peer:peer_user_id(full_name), peer_sessions:peer_observation(id, status, proposed_at, scheduled_at, peer_note, noticed, will_try, created_at))';

/** Latest active and latest draft plan for an educator (both may exist while revising). */
export async function loadPlans(supabase: SupabaseClient, educatorId: string) {
  const { data } = await supabase
    .from('idp')
    .select(`id, lineage_id, version, status, educator_id, centre_id, educator_confirmed_at, leader_confirmed_at, goals:idp_goal(${GOAL_SELECT})`)
    .eq('educator_id', educatorId)
    .in('status', ['draft', 'active'])
    .order('version', { ascending: false });
  const plans = ((data ?? []) as unknown as IdpView[]).map((p) => ({ ...p, goals: [...p.goals].sort((a, b) => a.position - b.position) }));
  return { active: plans.find((p) => p.status === 'active') ?? null, draft: plans.find((p) => p.status === 'draft') ?? null };
}

export async function loadLnaState(supabase: SupabaseClient, educatorId: string) {
  const { data } = await supabase
    .from('lna_attempt')
    .select('id, status, started_at, completed_at, result:lna_result(strengths, growth_areas, suggested_goals, summary, agreement)')
    .eq('educator_id', educatorId)
    .order('started_at', { ascending: false });
  // Prefer the latest completed analysis (it carries the snapshot); otherwise the open one.
  const rows = (data ?? []) as { status: string }[];
  const pick = rows.find((r) => r.status === 'completed') ?? rows[0] ?? null;
  return pick as null | {
    id: string; status: 'in_progress' | 'completed'; started_at: string; completed_at: string | null;
    result: null | { strengths: { subdomain: string; level: number; skill: string }[]; growth_areas: { subdomain: string; level: number; skill: string }[]; suggested_goals: unknown[]; summary: string | null; agreement: string | null };
  };
}

/** Observed levels over time for one indicator (only what this user may see under RLS). */
export async function loadTrajectory(supabase: SupabaseClient, educatorId: string, indicatorId: string) {
  const { data } = await supabase
    .from('tag')
    .select('level, valence, observation:observation_id!inner(id, scheduled_at, educator_id, status), evidence:evidence_unit_id(text, start_ms)')
    .eq('indicator_id', indicatorId)
    .eq('state', 'accepted')
    .eq('observation.educator_id', educatorId)
    .in('observation.status', ['shared', 'acknowledged', 'discussed']);
  const rows = ((data ?? []) as unknown as { level: number; valence: string; observation: { id: string; scheduled_at: string }; evidence: { text: string; start_ms: number } | null }[])
    .map((r) => ({ at: r.observation.scheduled_at, level: r.level, valence: r.valence, observationId: r.observation.id, text: r.evidence?.text ?? '', ms: r.evidence?.start_ms ?? 0 }))
    .sort((a, b) => a.at.localeCompare(b.at));
  return rows;
}
