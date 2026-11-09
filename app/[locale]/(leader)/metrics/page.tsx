import { getLocale } from 'next-intl/server';
import { MetricsBoard } from '@/components/metrics/metrics-board';
import { PageHeader } from '@/components/tend/page-header';
import { getSession } from '@/lib/auth/session';
import { dateline } from '@/lib/format';
import type { RawMetrics } from '@/lib/metrics';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Sandbox Metrics' };

export default async function MetricsPage() {
  const locale = await getLocale();
  const session = (await getSession())!;
  const centreId = session.memberships.find((m) => m.role === 'leader')?.centre_id ?? '';
  const supabase = await createClient();
  const { data } = await supabase.rpc('sandbox_metrics', { p_centre: centreId });
  return (
    <>
      <PageHeader dateline={dateline(new Date(), locale)} title="Sandbox Metrics" subtitle="Every KPI in the challenge brief, measured live inside Tend." />
      <MetricsBoard raw={(data ?? {}) as RawMetrics} csvHref={`/api/metrics/sandbox?centre=${centreId}`} />
    </>
  );
}
