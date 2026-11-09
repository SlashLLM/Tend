import { setRequestLocale } from 'next-intl/server';
import { requireArea } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { Area } from '@/lib/auth/roles';
import { AppShell } from './app-shell';

/** Shared server layout for each role area: auth guard + shell. */
export async function AreaLayout({ area, locale, children }: { area: Area; locale: string; children: React.ReactNode }) {
  setRequestLocale(locale);
  const session = await requireArea(area, locale);
  const centreId = session.memberships.find((m) => m.centre_id)?.centre_id;
  let centreName: string | null = null;
  if (centreId) {
    const supabase = await createClient();
    const { data } = await supabase.from('centre').select('name').eq('id', centreId).single();
    centreName = data?.name ?? null;
  }
  return (
    <AppShell area={area} userName={session.profile.full_name} centreName={centreName}>
      {children}
    </AppShell>
  );
}
