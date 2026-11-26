import { getLocale, getTranslations } from 'next-intl/server';
import { MetricsBoard } from '@/components/metrics/metrics-board';
import { PageHeader } from '@/components/tend/page-header';
import { getSession } from '@/lib/auth/session';
import { dateline } from '@/lib/format';
import type { RawMetrics } from '@/lib/metrics';
import { createClient } from '@/lib/supabase/server';
import { pageTitle } from '@/lib/i18n/meta';

export const generateMetadata = pageTitle('metrics');

export default async function MetricsPage() {
  const locale = await getLocale();
  const t = await getTranslations('metricsPage');
  const session = (await getSession())!;
  const centreId = session.memberships.find((m) => m.role === 'leader')?.centre_id ?? '';
  const supabase = await createClient();
  const { data } = await supabase.rpc('sandbox_metrics', { p_centre: centreId });
  return (
    <>
      <PageHeader dateline={dateline(new Date(), locale)} title={t('title')} subtitle={t('subtitle')} />
      <MetricsBoard raw={(data ?? {}) as RawMetrics} csvHref={`/api/metrics/sandbox?centre=${centreId}`} />
    </>
  );
}
