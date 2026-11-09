import { redirect } from 'next/navigation';
import { homePathFor } from '@/lib/auth/roles';
import { getSession, withLocale } from '@/lib/auth/session';
import { supabaseConfigured } from '@/lib/supabase/env';
import { SetupNotice } from '@/components/shell/setup-notice';

export default async function Index({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!supabaseConfigured()) return <SetupNotice />;
  const session = await getSession();
  redirect(withLocale(locale, session ? homePathFor(session.memberships) : '/login'));
}
