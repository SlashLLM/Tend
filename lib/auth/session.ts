import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';
import { canAccess, homePathFor, type Area, type Membership } from './roles';

export type Profile = {
  id: string;
  org_id: string;
  full_name: string;
  email: string;
  locale: 'en' | 'zh' | 'ms' | 'ta';
  text_scale: number;
  onboarded_at: string | null;
};

export type Session = { userId: string; profile: Profile; memberships: Membership[] };

/** The signed-in user's profile + memberships, read AS the user (RLS applies). Cached per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  if (!supabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from('app_user').select('id, org_id, full_name, email, locale, text_scale, onboarded_at').eq('id', user.id).single(),
    supabase.from('membership').select('role, centre_id').eq('user_id', user.id),
  ]);
  if (!profile) return null;
  return { userId: user.id, profile: profile as Profile, memberships: (memberships ?? []) as Membership[] };
});

function withLocale(locale: string, path: string) {
  return locale === 'en' ? path : `/${locale}${path}`;
}

/** Guard for an area layout: signed in + allowed, otherwise redirect. */
export async function requireArea(area: Area, locale: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(withLocale(locale, '/login'));
  if (!canAccess(area, session.memberships)) redirect(withLocale(locale, homePathFor(session.memberships)));
  return session;
}

export { withLocale };
