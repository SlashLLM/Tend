import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { areaName } from '@/lib/i18n/content';
import { homePathFor } from '@/lib/auth/roles';
import { getSession, withLocale } from '@/lib/auth/session';
import { MetricsBoard } from '@/components/metrics/metrics-board';
import { PageHeader, SectionTitle } from '@/components/tend/page-header';
import { dateline } from '@/lib/format';
import { SUBDOMAINS } from '@/lib/heatmap';
import { SUBDOMAIN_NAMES } from '@/lib/lna/content';
import type { RawMetrics } from '@/lib/metrics';
import { createClient } from '@/lib/supabase/server';
import { pageTitle } from '@/lib/i18n/meta';

export const generateMetadata = pageTitle('network');

type Row = { centre_id: string; centre_name: string; subdomain_code: string; educators: number; growing: number; share_growing: number };

export default async function NetworkPage() {
  const locale = await getLocale();
  const t = await getTranslations('network');
  const area = (code: string) => areaName(locale, code, SUBDOMAIN_NAMES[code] ?? code);
  // HQ only. Admins may open the other (hq) pages, but the PRD access table (p. 21) gives them no heatmap.
  const session = await getSession();
  if (!session?.memberships.some((m) => m.role === 'hq')) redirect(withLocale(locale, session ? homePathFor(session.memberships) : '/login'));
  const supabase = await createClient();
  const [{ data }, { data: metrics }] = await Promise.all([supabase.rpc('network_heatmap'), supabase.rpc('sandbox_metrics')]);
  const rows = (data ?? []) as Row[];
  const centres = [...new Map(rows.map((r) => [r.centre_id, { id: r.centre_id, name: r.centre_name, n: r.educators }])).values()];
  const cell = (c: string, s: string) => rows.find((r) => r.centre_id === c && r.subdomain_code === s);
  const shade = (x: number) => (x >= 0.5 ? 'bg-amber/45' : x >= 0.3 ? 'bg-amber/25' : x > 0 ? 'bg-amber/10' : 'bg-card');

  return (
    <>
      <PageHeader dateline={dateline(new Date(), locale)} title={t('title')} subtitle={t('subtitle')} />
      <section aria-labelledby="net" className="mb-10">
        <SectionTitle id="net">{t('share')}</SectionTitle>
        <div className="tend-card overflow-x-auto p-3">
          <table className="w-full min-w-[720px] border-separate border-spacing-1 text-sm">
            <caption className="sr-only">{t('caption')}</caption>
            <thead><tr><th scope="col" className="sticky left-0 z-10 bg-card text-left font-medium text-muted-foreground">{t('centre')}</th>{SUBDOMAINS.map((s) => <th key={s} scope="col" title={area(s)} className="font-medium">{s}</th>)}</tr></thead>
            <tbody>
              {centres.map((c) => (
                <tr key={c.id}>
                  <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-card pr-2 text-left font-normal">{c.name} <span className="text-xs text-muted-foreground">({c.n})</span></th>
                  {SUBDOMAINS.map((s) => {
                    const r = cell(c.id, s);
                    return <td key={s} className={`h-11 rounded-md text-center tabular-nums ${shade(Number(r?.share_growing ?? 0))}`}
                      aria-label={t('cell', { centre: c.name, sub: area(s), n: r?.growing ?? 0, total: c.n })}>{r?.growing ?? 0}/{c.n}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {centres.length === 0 && <p className="p-3 text-sm text-muted-foreground">{t('none')}</p>}
        </div>
      </section>
      <section aria-labelledby="kpi">
        <SectionTitle id="kpi">{t('metrics')}</SectionTitle>
        <MetricsBoard raw={(metrics ?? {}) as RawMetrics} csvHref="/api/metrics/sandbox" />
      </section>
    </>
  );
}
