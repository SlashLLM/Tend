'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { toLocale } from '@/i18n/routing';
import { mustChangePassword, PASSWORD_MAX } from '@/lib/auth/password';
import { demoSignInAllowed, homePathFor, safeNext, type Membership } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { setLocaleCookie } from '@/lib/i18n/locale-cookie';

export type LoginState = { status: 'idle' | 'error'; email?: string };

const Creds = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(PASSWORD_MAX * 4),
});

function home(locale: string) {
  const l = toLocale(locale);
  return l === 'en' ? '/' : `/${l}`;
}

/**
 * The signed-in user's own landing page (/admin, /today, …), so the browser goes there directly
 * instead of bouncing through `/` (which costs a whole extra request + session lookup).
 */
async function roleHome(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, locale: string) {
  const { data } = await supabase.from('membership').select('role, centre_id').eq('user_id', userId);
  const memberships = (data ?? []) as Membership[];
  if (!memberships.length) return home(locale); // let `/` decide (no-access etc.)
  const path = homePathFor(memberships);
  const l = toLocale(locale);
  return l === 'en' ? path : `/${l}${path}`;
}

/** The language saved in the user's profile wins over the login page's; the cookie keeps routing in step. */
async function preferredLocale(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, fallback: string) {
  const { data } = await supabase.from('app_user').select('locale').eq('id', userId).maybeSingle();
  const l = toLocale(data?.locale ?? fallback);
  await setLocaleCookie(l);
  return l;
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
  const locale = await preferredLocale(supabase, data.user.id, String(form.get('locale') ?? 'en'));
  // First sign-in with a temporary password: choose your own before anything else.
  if (mustChangePassword(data.user)) redirect(`${home(locale).replace(/\/$/, '')}/change-password`);
  const next = String(form.get('next') ?? '');
  redirect(safeNext(next, next ? home(locale) : await roleHome(supabase, data.user.id, locale)));
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
  const { data: verified, error: vErr } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: data.properties.hashed_token });
  if (vErr) throw new Error(`Demo sign-in failed: ${vErr.message}`);
  if (!verified.user) redirect(home(locale));
  const l = await preferredLocale(supabase, verified.user.id, locale);
  redirect(await roleHome(supabase, verified.user.id, l));
}
