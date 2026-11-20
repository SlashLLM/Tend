'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { toLocale } from '@/i18n/routing';
import { mustChangePassword, PASSWORD_MAX } from '@/lib/auth/password';
import { demoSignInAllowed, safeNext } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export type LoginState = { status: 'idle' | 'error'; email?: string };

const Creds = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(PASSWORD_MAX * 4),
});

function home(locale: string) {
  const l = toLocale(locale);
  return l === 'en' ? '/' : `/${l}`;
}

/** Email + password. Accounts are created by an admin (sign-ups are off). */
export async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = Creds.safeParse({ email: form.get('email'), password: form.get('password') });
  const email = String(form.get('email') ?? '');
  // One message for every failure: wrong password, unknown email and bad input look the same (no user enumeration).
  if (!parsed.success) return { status: 'error', email };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { status: 'error', email };
  const locale = String(form.get('locale') ?? 'en');
  // First sign-in with a temporary password: choose your own before anything else.
  if (mustChangePassword(data.user)) redirect(`${home(locale).replace(/\/$/, '')}/change-password`);
  redirect(safeNext(String(form.get('next') ?? ''), home(locale)));
}

/** DEMO_MODE only: sign in instantly as a synthetic demo persona (no password, no email sent). */
export async function demoSignIn(form: FormData) {
  const email = String(form.get('email') ?? '').toLowerCase();
  const locale = String(form.get('locale') ?? 'en');
  if (!demoSignInAllowed(email)) throw new Error('Demo sign-in is disabled');
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !data.properties?.hashed_token) throw new Error(`Demo sign-in failed: ${error?.message ?? 'no token'}`);
  const supabase = await createClient();
  const { error: vErr } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: data.properties.hashed_token });
  if (vErr) throw new Error(`Demo sign-in failed: ${vErr.message}`);
  redirect(home(locale));
}
