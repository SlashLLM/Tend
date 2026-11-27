import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { toLocale } from '@/i18n/routing';
import { homePathFor, primaryArea } from '@/lib/auth/roles';
import { getSession, withLocale } from '@/lib/auth/session';
import { pageTitle } from '@/lib/i18n/meta';
import { stepIndex } from '@/lib/onboarding';
import { OnboardingFlow } from './onboarding-flow';

export const dynamic = 'force-dynamic';
export const generateMetadata = pageTitle('onboarding');

/** First sign-in (PRD M1, §6 "Other journeys"): language → text size → 60-s intro → role → AI notice. */
export default async function OnboardingPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ step?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session) redirect(withLocale(locale, '/login'));
  const area = primaryArea(session.memberships);
  if (!area) redirect(withLocale(locale, '/no-access'));
  if (!session.needsOnboarding) redirect(withLocale(locale, homePathFor(session.memberships)));
  const t = await getTranslations();
  // Returning after a notice update: they already chose language and size, so start at the notice.
  const start = session.profile.onboarded_at ? 4 : stepIndex((await searchParams).step);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 py-8 sm:py-12">
      <p className="text-center font-heading text-3xl font-semibold text-primary">{t('app.name')}</p>
      <OnboardingFlow
        start={start}
        returning={!!session.profile.onboarded_at}
        locale={toLocale(locale)}
        textScale={Math.min(130, Math.max(100, session.profile.text_scale))}
        firstName={session.profile.full_name.split(' ')[0]}
        role={t(`role.${area === 'leader' && session.memberships.some((m) => m.role === 'mentor') && !session.memberships.some((m) => m.role === 'leader') ? 'mentor' : area}`)}
        centreName={session.centreName}
      />
      <form action="/auth/signout" method="post" className="text-center">
        <button className="min-h-11 text-sm text-primary underline">{t('auth.signOut')}</button>
      </form>
    </main>
  );
}
