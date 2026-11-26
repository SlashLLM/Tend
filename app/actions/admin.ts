'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { LOCALES, type Locale } from '@/i18n/routing';
import { generateTempPassword, MUST_CHANGE } from '@/lib/auth/password';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { setLocaleCookie } from '@/lib/i18n/locale-cookie';

/** The signed-in user, if they are an admin of their organisation. */
async function requireOrgAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: me } = await supabase.from('membership').select('org_id').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
  if (!me) throw new Error('Only admins can do this');
  return { supabase, userId: user.id, orgId: me.org_id as string };
}

/**
 * Admin resets someone's password: a new one-time temporary password they must replace at next sign-in.
 * Returned once to the admin to pass on in person; it is not stored or emailed.
 */
export async function resetUserPassword(userId: string): Promise<{ tempPassword: string }> {
  const id = z.string().uuid().parse(userId);
  const { userId: actor, orgId } = await requireOrgAdmin();
  if (id === actor) throw new Error('Use Change password for your own account');
  const admin = createAdminClient();
  const { data: target } = await admin.from('app_user').select('org_id').eq('id', id).maybeSingle();
  if (target?.org_id !== orgId) throw new Error('Person is not in your organisation');
  const tempPassword = generateTempPassword();
  const { error } = await admin.auth.admin.updateUserById(id, { password: tempPassword, email_confirm: true, app_metadata: { [MUST_CHANGE]: true } });
  if (error) throw new Error(error.message);
  await admin.from('audit_log').insert({ org_id: orgId, actor_id: actor, subject_user_id: id, action: 'password_reset', entity: 'app_user', entity_id: id });
  return { tempPassword };
}

/**
 * Admin invites a user: auth account (with a one-time temporary password) + profile + membership.
 * Caller must be an org admin. The temporary password is returned once, to pass on in person.
 */
export async function inviteUser(input: { name: string; email: string; role: string; centreId: string | null }): Promise<{ tempPassword: string }> {
  const v = z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email(),
    role: z.enum(['educator', 'leader', 'mentor', 'hq', 'admin']),
    centreId: z.string().uuid().nullable(),
  }).parse(input);
  if ((v.role === 'hq' || v.role === 'admin') !== (v.centreId === null)) throw new Error('HQ and admin are organisation-wide; other roles need a centre');
  const { supabase, userId: actor, orgId } = await requireOrgAdmin();
  const me = { org_id: orgId };
  if (v.centreId) {
    const { data: c } = await supabase.from('centre').select('org_id').eq('id', v.centreId).single();
    if (c?.org_id !== me.org_id) throw new Error('Centre is not in your organisation');
  }
  const admin = createAdminClient();
  const tempPassword = generateTempPassword();
  const { data: created, error } = await admin.auth.admin.createUser({ email: v.email, password: tempPassword, email_confirm: true, app_metadata: { [MUST_CHANGE]: true } });
  if (error || !created.user) throw new Error(/already/i.test(error?.message ?? '') ? 'Someone with this email already has an account' : (error?.message ?? 'invite failed'));
  const id = created.user.id;
  const { error: e1 } = await admin.from('app_user').insert({ id, org_id: me.org_id, full_name: v.name, email: v.email });
  if (e1) throw new Error(e1.message);
  await admin.from('membership').insert({ org_id: me.org_id, user_id: id, centre_id: v.centreId, role: v.role });
  if (v.role === 'educator' && v.centreId) await admin.from('educator_profile').insert({ user_id: id, org_id: me.org_id, centre_id: v.centreId, age_group: 'preschool' });
  await admin.from('audit_log').insert({ org_id: me.org_id, actor_id: actor, subject_user_id: id, action: 'invite', entity: 'app_user', entity_id: id });
  revalidatePath('/', 'layout');
  return { tempPassword };
}

/** Preferences: language, text size, Peer Match opt-in. */
export async function savePreferences(p: { locale: Locale; textScale: number; peerMatch?: boolean }) {
  const v = z.object({ locale: z.enum(LOCALES), textScale: z.number().int().min(100).max(130), peerMatch: z.boolean().optional() }).parse(p);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from('app_user').update({ locale: v.locale, text_scale: v.textScale }).eq('id', user!.id);
  if (error) throw new Error(error.message);
  await setLocaleCookie(v.locale);
  if (v.peerMatch !== undefined) await supabase.from('educator_profile').update({ peer_match_opt_in: v.peerMatch }).eq('user_id', user!.id);
  revalidatePath('/', 'layout');
}
