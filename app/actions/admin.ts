'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/** Admin invites a user: auth account + profile + membership. Caller must be an org admin. */
export async function inviteUser(input: { name: string; email: string; role: string; centreId: string | null }) {
  const v = z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email(),
    role: z.enum(['educator', 'leader', 'mentor', 'hq', 'admin']),
    centreId: z.string().uuid().nullable(),
  }).parse(input);
  if ((v.role === 'hq' || v.role === 'admin') !== (v.centreId === null)) throw new Error('HQ and admin are organisation-wide; other roles need a centre');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase.from('membership').select('org_id').eq('user_id', user!.id).eq('role', 'admin').maybeSingle();
  if (!me) throw new Error('Only admins can invite');
  if (v.centreId) {
    const { data: c } = await supabase.from('centre').select('org_id').eq('id', v.centreId).single();
    if (c?.org_id !== me.org_id) throw new Error('Centre is not in your organisation');
  }
  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.inviteUserByEmail(v.email);
  if (error || !created.user) throw new Error(error?.message ?? 'invite failed');
  const id = created.user.id;
  const { error: e1 } = await admin.from('app_user').insert({ id, org_id: me.org_id, full_name: v.name, email: v.email });
  if (e1) throw new Error(e1.message);
  await admin.from('membership').insert({ org_id: me.org_id, user_id: id, centre_id: v.centreId, role: v.role });
  if (v.role === 'educator' && v.centreId) await admin.from('educator_profile').insert({ user_id: id, org_id: me.org_id, centre_id: v.centreId, age_group: 'preschool' });
  await admin.from('audit_log').insert({ org_id: me.org_id, actor_id: user!.id, subject_user_id: id, action: 'invite', entity: 'app_user', entity_id: id });
  revalidatePath('/', 'layout');
}

/** Preferences: language, text size, Peer Match opt-in. */
export async function savePreferences(p: { locale: 'en' | 'zh'; textScale: number; peerMatch?: boolean }) {
  const v = z.object({ locale: z.enum(['en', 'zh']), textScale: z.number().int().min(100).max(130), peerMatch: z.boolean().optional() }).parse(p);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from('app_user').update({ locale: v.locale, text_scale: v.textScale }).eq('id', user!.id);
  if (error) throw new Error(error.message);
  if (v.peerMatch !== undefined) await supabase.from('educator_profile').update({ peer_match_opt_in: v.peerMatch }).eq('user_id', user!.id);
  revalidatePath('/', 'layout');
}
