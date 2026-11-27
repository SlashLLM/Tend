import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';
import { AI_NOTICE_VERSION } from '@/lib/onboarding';
import { canAccess, homePathFor, type Area, type Membership } from './roles';

export type Profile = {
  id: string;
  org_id: string;
  full_name: string;
  email: string;
  locale: 'en' | 'zh' | 'ms' | 'ta';
  text_scale: number;
  onboarded_at: string | null;
  tour_state: unknown;
};

export type Session = {
  userId: string;
  profile: Profile;
  memberships: Membership[];
  centreName: string | null;
  /** First sign-in not finished, or the AI-processing notice changed since they acknowledged it (PRD M1, §11). */
  needsOnboarding: boolean;
};

type MembershipRow = Membership & { centre: { name: string } | null };

/** The signed-in user's profile + memberships, read AS the user (RLS applies). Cached per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  if (!supabaseConfigured()) return null;
  const supabase = await createClient();
  // Middleware already validated + refreshed the session with getUser() on this request.
  // getClaims() verifies the JWT locally (no auth-server round trip when the project uses
  // asymmetric signing keys; it falls back to a network check otherwise). RLS still applies.
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;
  const [{ data: profile }, { data: memberships }, { data: notice }] = await Promise.all([
    supabase.from('app_user').select('id, org_id, full_name, email, locale, text_scale, onboarded_at, tour_state').eq('id', userId).single(),
    // The centre name rides along so the shell doesn't need a third, sequential round trip.
    supabase.from('membership').select('role, centre_id, centre:centre_id(name)').eq('user_id', userId),
    supabase.from('consent').select('id').eq('user_id', userId).eq('kind', 'ai_processing_notice').eq('version', AI_NOTICE_VERSION).is('revoked_at', null).limit(1),
  ]);
  if (!profile) return null;
  const rows = (memberships ?? []) as unknown as MembershipRow[];
  return {
    userId,
    profile: profile as Profile,
    memberships: rows.map(({ role, centre_id }) => ({ role, centre_id })),
    centreName: rows.find((m) => m.centre_id)?.centre?.name ?? null,
    needsOnboarding: !(profile as Profile).onboarded_at || !notice?.length,
  };
});

function withLocale(locale: string, path: string) {
  return locale === 'en' ? path : `/${locale}${path}`;
}

/** Guard for an area layout: signed in + allowed, otherwise redirect. */
export async function requireArea(area: Area, locale: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(withLocale(locale, '/login'));
  if (session.needsOnboarding) redirect(withLocale(locale, '/onboarding'));
  if (!canAccess(area, session.memberships)) redirect(withLocale(locale, homePathFor(session.memberships)));
  return session;
}

export { withLocale };
