'use server';
import { redirect } from 'next/navigation';
import { toLocale } from '@/i18n/routing';
import { checkNewPassword, MUST_CHANGE, mustChangePassword, PASSWORD_MAX, type PasswordProblem } from '@/lib/auth/password';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export type ChangeState = { status: 'idle' | 'error'; problem?: PasswordProblem | 'wrong_current' | 'same' | 'failed' };

/**
 * Choose a new password. After a temporary password (first sign-in or an admin reset) the current
 * password is not asked again — they just typed it. Otherwise it is, so an unattended session can't
 * be used to take over the account.
 */
export async function changePassword(_prev: ChangeState, form: FormData): Promise<ChangeState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { status: 'error', problem: 'failed' };
  const forced = mustChangePassword(user);

  const next = String(form.get('password') ?? '');
  const problem = checkNewPassword(next, String(form.get('confirm') ?? ''));
  if (problem) return { status: 'error', problem };

  if (!forced) {
    const current = String(form.get('current') ?? '').slice(0, PASSWORD_MAX * 4);
    const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
    if (error) return { status: 'error', problem: 'wrong_current' };
    if (current === next) return { status: 'error', problem: 'same' };
  }

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { status: 'error', problem: /different from the old/i.test(error.message) ? 'same' : 'failed' };

  const admin = createAdminClient();
  if (forced) await admin.auth.admin.updateUserById(user.id, { app_metadata: { [MUST_CHANGE]: false } });
  const { data: me } = await admin.from('app_user').select('org_id').eq('id', user.id).maybeSingle();
  if (me) await admin.from('audit_log').insert({ org_id: me.org_id, actor_id: user.id, subject_user_id: user.id, action: 'password_change', entity: 'app_user', entity_id: user.id });

  const l = toLocale(form.get('locale'));
  redirect(l === 'en' ? '/' : `/${l}`);
}
