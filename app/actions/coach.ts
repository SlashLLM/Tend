'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
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
