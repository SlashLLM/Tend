import { ArrowRight, ClipboardList, PenLine, Sparkles } from 'lucide-react';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { IdpEditor } from '@/components/growth/idp-editor';
import { IndicatorTag } from '@/components/tend/indicator-tag';
import { LevelStones } from '@/components/tend/level-stones';
import { PageHeader, SectionTitle } from '@/components/tend/page-header';
import { getSession } from '@/lib/auth/session';
import { loadLnaState, loadPlans } from '@/lib/data/growth';
import { dateline } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { ReviseButton } from './revise-button';
import { indicatorName } from '@/lib/i18n/content';
import { pageTitle } from '@/lib/i18n/meta';

export const generateMetadata = pageTitle('growth');

export default async function GrowthPage() {
  const locale = await getLocale();
  const t = await getTranslations('growth');
  const format = await getFormatter();
  const session = (await getSession())!;
  const supabase = await createClient();
  const [lna, plans, { data: indicators }] = await Promise.all([
    loadLnaState(supabase, session.userId),
    loadPlans(supabase, session.userId, locale),
    supabase.from('indicator').select('code, name, domain_code, framework_version!inner(status)').in('domain_code', ['1', '2', '3']).eq('framework_version.status', 'active').order('code'),
  ]);
  const options = (indicators ?? []).map((i) => ({ code: i.code, name: indicatorName(locale, i.code, i.name) }));
  const header = <PageHeader dateline={dateline(new Date(), locale)} title={t('title')} subtitle={t('subtitle')} />;

  // 1) Never started → invite to the needs analysis
  if (!lna && !plans.active && !plans.draft) {
    return (
      <>
        {header}
        <section className="tend-card grid gap-4 p-6 md:max-w-2xl md:p-8">
          <Sparkles className="size-6 text-amber" aria-hidden />
          <h2 className="text-xl font-semibold">{t('startTitle')}</h2>
          <p className="text-muted-foreground">{t('startBody')}</p>
          <Button asChild className="min-h-11 self-start">
            <Link href="/growth/needs-analysis">{t('startCta')} <ArrowRight aria-hidden /></Link>
          </Button>
        </section>
      </>
    );
  }

  // 2) In progress → resume
  if (lna?.status === 'in_progress' && !plans.draft && !plans.active) {
    return (
      <>
        {header}
        <section className="tend-card grid gap-4 p-6 md:max-w-2xl">
          <ClipboardList className="size-6 text-primary" aria-hidden />
          <h2 className="text-xl font-semibold">{t('waitingTitle')}</h2>
          <p className="text-muted-foreground">{t('waitingBody')}</p>
          <Button asChild className="min-h-11 self-start"><Link href="/growth/needs-analysis">{t('continue')} <ArrowRight aria-hidden /></Link></Button>
        </section>
      </>
    );
  }

  return (
    <>
      {header}
      {plans.draft && (
        <section aria-labelledby="draft" className="mb-10">
          <SectionTitle id="draft" action={lna?.result && <Link href="/growth/snapshot" className="text-sm text-primary underline-offset-4 hover:underline">{t('snapshot')}</Link>}>
            {t('draftTitle')}
          </SectionTitle>
          <IdpEditor plan={plans.draft} viewer="educator" indicatorOptions={options} educatorName={session.profile.full_name} />
        </section>
      )}

      {plans.active && (
        <section aria-labelledby="active">
          <SectionTitle id="active" count={plans.active.goals.length} action={!plans.draft && <ReviseButton idpId={plans.active.id} />}>
            {t('myGoals')}
          </SectionTitle>
          <ul className="tend-card divide-y">
            {plans.active.goals.map((g) => (
              <li key={g.id}>
                <Link href={`/growth/goal/${g.id}`} className="tend-row flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="grid gap-1.5">
                    <IndicatorTag code={g.indicator.code} name={g.indicator.name} className="self-start" />
                    <span className="text-xs text-muted-foreground">{t('openActions', { n: g.actions.filter((a) => a.status !== 'done').length })}{g.review_date ? t('reviewOn', { date: format.dateTime(new Date(g.review_date), { day: 'numeric', month: 'short' }) }) : ''}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <LevelStones level={g.current_level} target={g.target_level} size="sm" />
                    <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><PenLine className="size-3.5" aria-hidden /> {t('versionConfirmed', { v: plans.active.version })}</p>
        </section>
      )}
    </>
  );
}
