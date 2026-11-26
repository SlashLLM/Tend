'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const uuid = z.string().uuid();
const level = z.number().int().min(1).max(3);

function refresh() {
  revalidatePath('/', 'layout');
}

async function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function setGoalLevels(goalId: string, levels: { current_level?: number; target_level?: number }) {
  uuid.parse(goalId);
  const patch = z.object({ current_level: level.optional(), target_level: level.optional() }).parse(levels);
  const supabase = await createClient();
  const { data, error } = await supabase.from('idp_goal').update(patch).eq('id', goalId).select('id');
  await fail(error);
  if (!data?.length) throw new Error('This plan is no longer editable.');
  refresh();
}

export async function removeGoal(goalId: string) {
  uuid.parse(goalId);
  const supabase = await createClient();
  const { data, error } = await supabase.from('idp_goal').delete().eq('id', goalId).select('id');
  await fail(error);
  if (!data?.length) throw new Error('This plan is no longer editable.');
  refresh();
}

export async function addGoal(idpId: string, indicatorCode: string) {
  uuid.parse(idpId);
  z.string().regex(/^(\d\.\d\.\d|IT\.\d)$/).parse(indicatorCode);
  const supabase = await createClient();
  const { data: idp } = await supabase.from('idp').select('org_id, status').eq('id', idpId).single();
  if (!idp || idp.status !== 'draft') throw new Error('This plan is no longer editable.');
  const { count } = await supabase.from('idp_goal').select('id', { count: 'exact', head: true }).eq('idp_id', idpId);
  if ((count ?? 0) >= 3) throw new Error('A plan has at most 3 goals.');
  const { data: ind } = await supabase
    .from('indicator')
    .select('id, framework_version_id, framework_version!inner(status)')
    .eq('code', indicatorCode)
    .eq('framework_version.status', 'active')
    .limit(1)
    .single();
  if (!ind) throw new Error('Unknown indicator');
  const { data: map } = await supabase.from('indicator_tsc_map').select('tsc_id').eq('indicator_id', ind.id).limit(1).maybeSingle();
  const { error } = await supabase.from('idp_goal').insert({
    org_id: idp.org_id, idp_id: idpId, indicator_id: ind.id, framework_version_id: ind.framework_version_id,
    current_level: 1, target_level: 2, tsc_id: map?.tsc_id ?? null, position: count ?? 0,
    review_date: new Date(Date.now() + 56 * 86_400_000).toISOString().slice(0, 10),
  });
  await fail(error);
  refresh();
}

export async function addAction(goalId: string, description: string, source: 'manual' | 'pathway' = 'manual', pdActivityId?: string, peerUserId?: string) {
  uuid.parse(goalId);
  const text = z.string().trim().min(3).max(300).parse(description);
  const supabase = await createClient();
  const { data: goal } = await supabase.from('idp_goal').select('org_id, indicator:indicator_id(code)').eq('id', goalId).single();
  if (!goal) throw new Error('Goal not found');
  if (peerUserId) {
    // A peer action must name a colleague Peer Match actually suggests for this goal (opted in, seen at Level 3).
    uuid.parse(peerUserId);
    const code = (goal.indicator as unknown as { code: string } | null)?.code;
    const { data: peers } = await supabase.rpc('peer_matches', { p_indicator_code: code });
    if (!((peers ?? []) as { user_id: string }[]).some((p) => p.user_id === peerUserId)) throw new Error('That colleague is no longer a peer match for this goal');
  }
  const { error } = await supabase.from('idp_action').insert({
    org_id: goal.org_id, idp_goal_id: goalId, description: text, source,
    status: source === 'pathway' ? 'proposed' : 'open', pd_activity_id: pdActivityId ?? null, peer_user_id: peerUserId ?? null,
  });
  await fail(error);
  refresh();
}

/** Mark an endorsed action done (optional note), or undo. Peer observations complete through their reflection instead. */
export async function setActionStatus(actionId: string, status: 'open' | 'done', note?: string) {
  uuid.parse(actionId);
  const supabase = await createClient();
  const { error } =
    status === 'done'
      ? await supabase.rpc('complete_action', { p_action: actionId, p_note: z.string().max(500).optional().parse(note) ?? null })
      : await supabase.rpc('reopen_action', { p_action: actionId });
  await fail(error);
  refresh();
}

/** Leader endorses a proposed action (the DB trigger enforces "leaders only"). */
export async function endorseAction(actionId: string) {
  uuid.parse(actionId);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from('idp_action').update({ status: 'open', endorsed_by: user!.id }).eq('id', actionId);
  await fail(error);
  refresh();
}

export async function confirmIdp(idpId: string) {
  uuid.parse(idpId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('confirm_idp', { p_idp: idpId });
  await fail(error);
  refresh();
  return data as 'draft' | 'active';
}

export async function decideSuggestion(id: string, accept: boolean) {
  uuid.parse(id);
  const supabase = await createClient();
  const { error } = await supabase.rpc('decide_idp_suggestion', { p_id: id, p_accept: accept });
  await fail(error);
  refresh();
}

/** Start a new draft version from the active plan (for edits after confirmation). */
export async function reviseIdp(activeIdpId: string) {
  uuid.parse(activeIdpId);
  const supabase = await createClient();
  const { data: cur } = await supabase.from('idp').select('*').eq('id', activeIdpId).single();
  if (!cur || cur.status !== 'active') throw new Error('Only the active plan can be revised');
  const { data: existing } = await supabase.from('idp').select('id').eq('lineage_id', cur.lineage_id).eq('status', 'draft').maybeSingle();
  if (existing) return existing.id as string;
  const { data: max } = await supabase.from('idp').select('version').eq('lineage_id', cur.lineage_id).order('version', { ascending: false }).limit(1).single();
  const { data: draft, error } = await supabase
    .from('idp')
    .insert({ org_id: cur.org_id, centre_id: cur.centre_id, educator_id: cur.educator_id, lineage_id: cur.lineage_id, version: (max?.version ?? cur.version) + 1 })
    .select('id')
    .single();
  await fail(error);
  const { data: goals } = await supabase.from('idp_goal').select('*').eq('idp_id', activeIdpId).order('position');
  for (const g of goals ?? []) {
    const { id: _old, idp_id: _i, ...rest } = g;
    void _old; void _i;
    await supabase.from('idp_goal').insert({ ...rest, idp_id: draft!.id });
  }
  refresh();
  return draft!.id as string;
}
