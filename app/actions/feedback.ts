'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const uuid = z.string().uuid();

/** Reflect FIRST — unlocks the feedback (enforced in the database, not just the UI). */
export async function submitReflection(obsId: string, body: string) {
  uuid.parse(obsId);
  const text = z.string().trim().min(3, 'Write a few words first').max(2000).parse(body);
  const supabase = await createClient();
  const { error } = await supabase.rpc('submit_reflection', { p_obs: obsId, p_body: text });
  if (error) throw new Error(error.message);
  revalidatePath('/', 'layout');
}

export async function respond(obsId: string, kind: 'agree' | 'context' | 'thumbs', target: string | null, body?: string, value?: 'up' | 'down') {
  uuid.parse(obsId);
  z.enum(['agree', 'context', 'thumbs']).parse(kind);
  const supabase = await createClient();
  const { error } = await supabase.rpc('respond_to_feedback', { p_obs: obsId, p_kind: kind, p_target: target, p_body: body ?? null, p_value: value ?? null });
  if (error) throw new Error(error.message);
  if (kind === 'thumbs') {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: o } = await supabase.from('observation').select('org_id, centre_id').eq('id', obsId).single();
    if (o) await supabase.from('feedback_event').insert({ org_id: o.org_id, centre_id: o.centre_id, user_id: user!.id, kind: 'feedback_thumbs', ref_id: obsId, value });
  }
  revalidatePath('/', 'layout');
}
