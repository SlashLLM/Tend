'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { demoSignInAllowed, safeNext } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export type LoginState = { status: 'idle' | 'sent' | 'error'; message?: string };

const Email = z.string().trim().toLowerCase().email().max(254);

async function origin() {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('x-forwarded-host') ?? h.get('host');
  return process.env.NEXT_PUBLIC_SITE_URL ?? `${proto}://${host}`;
}

/** Email magic link. Only existing (invited) users can sign in — no self sign-up. */
export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = Email.safeParse(form.get('email'));
  if (!parsed.success) return { status: 'error', message: 'invalid_email' };
  const next = safeNext(String(form.get('next') ?? ''), '/');
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  // Same answer whether or not the account exists (no user enumeration).
  if (error && !/not found|signups not allowed/i.test(error.message)) return { status: 'error', message: 'send_failed' };
  return { status: 'sent' };
}

/** DEMO_MODE only: sign in instantly as a synthetic demo persona. */
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
  redirect(locale === 'en' ? '/' : `/${locale}`);
}
