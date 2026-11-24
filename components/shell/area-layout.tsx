import { setRequestLocale } from 'next-intl/server';
import { requireArea } from '@/lib/auth/session';
import type { Area } from '@/lib/auth/roles';
import { AppShell } from './app-shell';

/** Shared server layout for each role area: auth guard + shell. */
export async function AreaLayout({ area, locale, children }: { area: Area; locale: string; children: React.ReactNode }) {
  setRequestLocale(locale);
  const session = await requireArea(area, locale);
  return (
    <AppShell area={area} userName={session.profile.full_name} centreName={session.centreName}>
      {children}
    </AppShell>
  );
}
