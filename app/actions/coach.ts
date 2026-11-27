'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function logTriedIt(cardId: string, note?: string) {
  z.string().uuid().parse(cardId);
  const text = z.string().max(500).optional().parse(note);
  const supabase = await createClient();
  const { error } = await supabase.rpc('log_strategy_attempt', { p_card: cardId, p_note: text || null });
  if (error) throw new Error(error.message);
  revalidatePath('/', 'layout');
}

export async function saveReflection(body: string, visibility: 'private' | 'shared') {
  const text = z.string().trim().min(1).max(4000).parse(body);
  z.enum(['private', 'shared']).parse(visibility);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: p } = await supabase.from('educator_profile').select('org_id, centre_id').eq('user_id', user!.id).single();
  if (!p) throw new Error('Only educators keep a reflection journal');
  const { error } = await supabase.from('reflection').insert({ org_id: p.org_id, centre_id: p.centre_id, educator_id: user!.id, visibility, body: text });
  if (error) throw new Error(error.message);
  revalidatePath('/', 'layout');
}

export async function deleteReflection(id: string) {
  z.string().uuid().parse(id);
  const supabase = await createClient();
  const { error } = await supabase.from('reflection').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/', 'layout');
}

/** True when the signed-in user leads the centre this educator belongs to (RLS-scoped reads only). */
async function leadsEducator(supabase: Awaited<ReturnType<typeof createClient>>, educatorId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: p } = await supabase.from('educator_profile').select('centre_id').eq('user_id', educatorId).maybeSingle();
  if (!p?.centre_id) return false;
  const { data: m } = await supabase.from('membership').select('role').eq('user_id', user.id).eq('role', 'leader').eq('centre_id', p.centre_id).limit(1);
  return !!m?.length;
}

export type CoachThreadMeta = { id: string; created_at: string; messages: number };

/**
 * Leader drill-down, step 1 (PRD M5.7): which conversations exist — dates and message counts only,
 * never titles or text (titles are the educator's own first words). Nothing here is logged because
 * no content is shown; opening one goes through `openCoachThread`, which is.
 */
export async function listCoachThreads(educatorId: string): Promise<CoachThreadMeta[]> {
  z.string().uuid().parse(educatorId);
  const supabase = await createClient();
  if (!(await leadsEducator(supabase, educatorId))) throw new Error('not allowed');
  // Leaders have no RLS read on coach_thread (by design), so the server lists metadata only.
  const admin = createAdminClient();
  const { data } = await admin.from('coach_thread').select('id, created_at, coach_message(count)').eq('educator_id', educatorId).order('created_at', { ascending: false }).limit(20);
  return ((data ?? []) as unknown as { id: string; created_at: string; coach_message: { count: number }[] }[]).map((t) => ({
    id: t.id,
    created_at: t.created_at,
    messages: t.coach_message?.[0]?.count ?? 0,
  }));
}

/** Leader drill-down, step 2: read one conversation. The SQL function checks access AND writes the audit entry the educator sees. */
export async function openCoachThread(threadId: string): Promise<{ role: 'user' | 'assistant'; content: string; created_at: string }[]> {
  z.string().uuid().parse(threadId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('leader_open_coach_thread', { p_thread: threadId });
  if (error) throw new Error(error.message);
  return (data ?? []) as { role: 'user' | 'assistant'; content: string; created_at: string }[];
}
