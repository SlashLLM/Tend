'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export async function createLearningGroup(input: { centreId: string; name: string; subdomain: string; memberIds: string[]; leadIds: string[]; pdActivityId: string | null }) {
  const v = z.object({
    centreId: z.string().uuid(), name: z.string().min(3).max(120), subdomain: z.string().regex(/^\d\.\d$/),
    memberIds: z.array(z.string().uuid()).min(1).max(30), leadIds: z.array(z.string().uuid()).max(5), pdActivityId: z.string().uuid().nullable(),
  }).parse(input);
  const supabase = await createClient();
  const { data: centre } = await supabase.from('centre').select('org_id').eq('id', v.centreId).single();
  const { error } = await supabase.from('plc').insert({
    org_id: centre!.org_id, centre_id: v.centreId, name: v.name, member_ids: v.memberIds, lead_ids: v.leadIds,
    pd_activity_id: v.pdActivityId, starts_on: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10), weeks: 4,
  });
  if (error) throw new Error(error.message); // RLS: centre leaders only
  revalidatePath('/', 'layout');
}
