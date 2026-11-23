'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const uuid = z.string().uuid();

/** Educator chooses up to 2 focus goals before the visit (PRD M4.2). */
export async function setFocus(obsId: string, goalIds: string[], note: string) {
  uuid.parse(obsId);
  const ids = z.array(uuid).max(2).parse(goalIds);
  const text = z.string().max(500).parse(note);
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_observation_focus', { p_obs: obsId, p_goal_ids: ids, p_note: text || null });
  if (error) throw new Error(error.message);
  revalidatePath('/', 'layout');
}

/** Leader schedules an observation (PRD M4.1). */
export async function scheduleObservation(input: { educatorId: string; when: string; durationMin: number; title: string; classId?: string | null }) {
  const v = z
    .object({ educatorId: uuid, when: z.string().datetime({ offset: true }), durationMin: z.number().int().min(5).max(90), title: z.string().trim().min(2).max(80), classId: uuid.nullish() })
    .parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('schedule_observation', {
    p_educator: v.educatorId, p_scheduled_at: v.when, p_duration_min: v.durationMin, p_class: v.classId ?? null, p_title: v.title,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/', 'layout');
  return data as string;
}

/**
 * Start capture. Returns how long ago it started (measured on this server's clock, from just before
 * the database stamped it) — the device anchors offsets on its own clock (lib/capture/clock.ts).
 */
export async function startCapture(obsId: string): Promise<{ elapsedMs: number }> {
  uuid.parse(obsId);
  const supabase = await createClient();
  const before = Date.now();
  const { error } = await supabase.rpc('start_capture', { p_obs: obsId });
  if (error) throw new Error(error.message);
  return { elapsedMs: Date.now() - before };
}
