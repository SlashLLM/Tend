import { ArrowRight, Leaf, Sprout } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { areaName, indicatorName, tscTitle } from '@/lib/i18n/content';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { IndicatorTag } from '@/components/tend/indicator-tag';
import { PageHeader, SectionTitle } from '@/components/tend/page-header';
import { getSession } from '@/lib/auth/session';
import { loadLnaState } from '@/lib/data/growth';
import { SUBDOMAIN_NAMES } from '@/lib/lna/content';
import { TSC } from '@/supabase/seed/registry';
import { createClient } from '@/lib/supabase/server';
import { Agreement } from './agreement';
import { pageTitle } from '@/lib/i18n/meta';

export const generateMetadata = pageTitle('snapshot');

export default async function SnapshotPage() {
  const session = (await getSession())!;
  const t = await getTranslations('snapshot');
  const locale = await getLocale();
  const skillTitle = (code: string) => tscTitle(locale, code, TSC.find((x) => x.code === code)?.title ?? code);
  const area = (code: string) => areaName(locale, code, SUBDOMAIN_NAMES[code] ?? code);
  // Reasons are stored in English by the scorer; show them in the reader's language.
  const reasonText = (r: string) => (r.startsWith('You said you are still finding') ? t('reasonConf') : r.startsWith('Your answers suggest') ? t('reasonNext') : r);
  const supabase = await createClient();
  const lna = await loadLnaState(supabase, session.userId);
  if (!lna?.result) redirect('/growth');
  const r = lna.result;
  const goals = r.suggested_goals as { indicator: string; reason: string }[];
  const { data: inds } = await supabase.from('indicator').select('code, name').in('code', goals.map((g) => g.indicator));
  const nameOf = (c: string) => indicatorName(locale, c, inds?.find((i) => i.code === c)?.name ?? c);

  return (
    <>
      <PageHeader dateline={t('dateline')} title={t('title')} subtitle={r.summary ?? undefined} />
      <p className="-mt-4 mb-6 text-xs text-muted-foreground">{t('autoNote')}</p>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="tend-card p-5" aria-labelledby="strengths">
          <SectionTitle id="strengths"><Leaf className="mr-2 inline size-4 text-success" aria-hidden />{t('strengths')}</SectionTitle>
          <ul className="grid gap-3">
            {r.strengths.map((s) => (
              <li key={s.subdomain}>
                <p className="font-medium">{area(s.subdomain)}</p>
                <p className="text-sm text-muted-foreground">{skillTitle(s.skill)}</p>
              </li>
            ))}
          </ul>
        </section>
        <section className="tend-card p-5" aria-labelledby="growth">
          <SectionTitle id="growth"><Sprout className="mr-2 inline size-4 text-amber" aria-hidden />{t('growthAreas')}</SectionTitle>
          <ul className="grid gap-3">
            {r.growth_areas.map((s) => (
              <li key={s.subdomain}>
                <p className="font-medium">{area(s.subdomain)}</p>
                <p className="text-sm text-muted-foreground">{skillTitle(s.skill)}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-6 tend-card p-5" aria-labelledby="suggested">
        <SectionTitle id="suggested">{t('suggested')}</SectionTitle>
        <ul className="grid gap-3">
          {goals.map((g) => (
            <li key={g.indicator} className="grid gap-1">
              <IndicatorTag code={g.indicator} name={nameOf(g.indicator)} className="self-start" />
              <p className="text-sm text-muted-foreground">{reasonText(g.reason)}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <Agreement attemptId={lna.id} initial={r.agreement as 'yes' | 'partly' | 'no' | null} />
        <Button asChild className="min-h-11"><Link href="/growth">{t('shapePlan')} <ArrowRight aria-hidden /></Link></Button>
      </div>
    </>
  );
}
