import { setRequestLocale } from 'next-intl/server';
import { requireArea } from '@/lib/auth/session';
import { primaryArea, type Area } from '@/lib/auth/roles';
import { AppShell } from './app-shell';

/** Shared server layout for each role area: auth guard + shell. */
export async function AreaLayout({ area, locale, children }: { area: Area; locale: string; children: React.ReactNode }) {
  setRequestLocale(locale);
  const session = await requireArea(area, locale);
  // Admins may open HQ pages (e.g. /registry); keep their own menu instead of switching to HQ's.
  const navArea: Area = area === 'hq' && primaryArea(session.memberships) === 'admin' ? 'admin' : area;
  return (
    <AppShell area={navArea} userName={session.profile.full_name} centreName={session.centreName}>
      {children}
    </AppShell>
  );
}
