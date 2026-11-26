import { redirect } from 'next/navigation';
import { AreaLayout } from '@/components/shell/area-layout';
import { primaryArea } from '@/lib/auth/roles';
import { getSession, withLocale } from '@/lib/auth/session';

// Private, per-user pages: always render on request (auth + RLS), never prerender.
export const dynamic = 'force-dynamic';

/** Pages every signed-in person has (Preferences), shown inside their own role's shell and menu. */
export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await getSession();
  if (!session) redirect(withLocale(locale, '/login'));
  const area = primaryArea(session.memberships);
  if (!area) redirect(withLocale(locale, '/no-access'));
  return <AreaLayout area={area} locale={locale}>{children}</AreaLayout>;
}
