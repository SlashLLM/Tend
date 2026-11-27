'use server';
import { z } from 'zod';
import type { Area } from '@/lib/auth/roles';
import { parseTourState, TOURS } from '@/lib/tours';
import { createClient } from '@/lib/supabase/server';

const AREAS = Object.keys(TOURS) as [Area, ...Area[]];
const Input = z.object({
  area: z.enum(AREAS),
  progress: z.union([z.literal('done'), z.literal('skipped'), z.number().int().min(0).max(4)]),
});

/** Save role-tour progress for one area (merged into `app_user.tour_state`; RLS: own row only). */
export async function saveTourProgress(input: z.input<typeof Input>) {
  const v = Input.parse(input);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: me } = await supabase.from('app_user').select('org_id, tour_state').eq('id', user.id).single();
  if (!me) throw new Error('No profile');
  const progress = typeof v.progress === 'number' ? Math.min(v.progress, TOURS[v.area].length - 1) : v.progress;
  const next = { ...parseTourState(me.tour_state), [v.area]: progress };
  const { error } = await supabase.from('app_user').update({ tour_state: next }).eq('id', user.id);
  if (error) throw new Error(error.message);
  // Tour completion is one of the adoption signals (PRD §3).
  if (progress === 'done' || progress === 'skipped') {
    const { data: m } = await supabase.from('membership').select('centre_id').eq('user_id', user.id).not('centre_id', 'is', null).limit(1).maybeSingle();
    await supabase.from('feedback_event').insert({ org_id: me.org_id, centre_id: m?.centre_id ?? null, user_id: user.id, kind: 'tour_complete', value: `${v.area}:${progress}` });
  }
}
