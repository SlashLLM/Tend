'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/** Peer Match → a real 15-minute peer observation. Rules live in the database functions (migration 0008). */
const uuid = z.string().uuid();
const when = z.string().datetime({ offset: true }).nullable().optional();
const note = z.string().trim().max(300).optional();

async function call(fn: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  revalidatePath('/', 'layout');
  return data;
}

export async function requestPeerObservation(actionId: string, at?: string | null, message?: string) {
  return (await call('request_peer_observation', { p_action: uuid.parse(actionId), p_when: when.parse(at) ?? null, p_note: note.parse(message) || null })) as string;
}

export async function respondPeerObservation(id: string, accept: boolean, at?: string | null, message?: string) {
  await call('respond_peer_observation', { p_id: uuid.parse(id), p_accept: accept, p_when: when.parse(at) ?? null, p_note: note.parse(message) || null });
}

export async function cancelPeerObservation(id: string) {
  await call('cancel_peer_observation', { p_id: uuid.parse(id) });
}

export async function completePeerObservation(id: string, noticed: string, willTry: string) {
  await call('complete_peer_observation', {
    p_id: uuid.parse(id),
    p_noticed: z.string().trim().min(10, 'Write a sentence about what you noticed').max(1000).parse(noticed),
    p_will_try: z.string().trim().min(3, 'Add one thing you will try').max(500).parse(willTry),
  });
}
