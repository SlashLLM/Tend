import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { areaName, indicatorName } from '@/lib/i18n/content';
import { Link } from '@/i18n/navigation';
import { ActionItem } from '@/components/growth/action-item';
import { IdpEditor } from '@/components/growth/idp-editor';
import { IndicatorTag } from '@/components/tend/indicator-tag';
import { LevelStones } from '@/components/tend/level-stones';
import { PageHeader, SectionTitle } from '@/components/tend/page-header';
import { loadLnaState, loadPlans, loadTrajectory } from '@/lib/data/growth';
import { SUBDOMAIN_NAMES } from '@/lib/lna/content';
import { collapseByObservation, latestMove } from '@/lib/trajectory';
import { createClient } from '@/lib/supabase/server';
import { Suggestions } from './suggestions';
import { CoachDigest } from './coach-digest';
import { ProposedActions } from './proposed-actions';
import { pageTitle } from '@/lib/i18n/meta';

export const generateMetadata = pageTitle('educator360');


export default async function Educator360({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const locale = await getLocale();
  const area = (code: string) => areaName(locale, code, SUBDOMAIN_NAMES[code] ?? code);
  const t = await getTranslations('e360');
  const ts = await getTranslations('obsStatus');
  const te = await getTranslations('educators');
  const tsnap = await getTranslations('snapshot');
  const format = await getFormatter();
  const { data: person } = await supabase.from('app_user').select('id, full_name, profile:educator_profile(years_experience, title:occupational_title_id(name))').eq('id', id).maybeSingle();
  if (!person) notFound();
  const [plans, lna, { data: obs }, { data: indicators }, { data: tried }] = await Promise.all([
    loadPlans(supabase, id, locale),
    loadLnaState(supabase, id),
    supabase.from('observation').select('id, title, status, scheduled_at').eq('educator_id', id).order('scheduled_at', { ascending: false }).limit(12),
    supabase.from('indicator').select('code, name, framework_version!inner(status)').in('domain_code', ['1', '2', '3']).eq('framework_version.status', 'active').order('code'),
    supabase.from('strategy_attempt').select('id, tried_on').eq('educator_id', id).order('tried_on', { ascending: false }).limit(50),
  ]);
  const { data: suggestions } = plans.active
    ? await supabase.from('idp_suggestion').select('id, kind, payload, goal:idp_goal_id(indicator:indicator_id(code, name), current_level, target_level)').eq('status', 'pending').eq('idp_id', plans.active.id)
    : { data: [] };
  const activeGoals = plans.active?.goals ?? [];
  const trajectories = await Promise.all(activeGoals.map(async (g) => ({ g, pts: collapseByObservation(await loadTrajectory(supabase, id, g.indicator.id)) })));
  const mySuggestions = ((suggestions ?? []) as unknown as { id: string; kind: string; payload: { current_level?: number; target_level?: number }; goal: { indicator: { code: string; name: string }; current_level: number; target_level: number } | null }[])
    .filter((s) => s.goal);
  const profile = (person.profile as unknown as { years_experience: number; title: { name: string } | null }[] | { years_experience: number; title: { name: string } | null } | null);
  const prof = Array.isArray(profile) ? profile[0] : profile;

  return (
    <>
      <Link href="/educators" className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> {t('back')}</Link>
      <PageHeader dateline={t('dateline', { title: prof?.title?.name ?? te('educator'), years: prof?.years_experience != null ? te('years', { n: prof.years_experience }) : '—' })} title={person.full_name}
        subtitle={t('subtitle', { tried: (tried ?? []).length, shared: (obs ?? []).filter((o) => ['shared', 'acknowledged', 'discussed'].includes(o.status)).length })} />

      {mySuggestions.length > 0 && (
        <section className="mb-8" aria-labelledby="sugg">
          <SectionTitle id="sugg" count={mySuggestions.length}><Sparkles className="mr-1.5 inline size-4 text-amber" aria-hidden />{t('suggestions')}</SectionTitle>
          <Suggestions items={mySuggestions.map((s) => ({ id: s.id, kind: s.kind, code: s.goal!.indicator.code, name: indicatorName(locale, s.goal!.indicator.code, s.goal!.indicator.name), from: s.goal!.target_level, to: s.payload.target_level ?? null, level: s.payload.current_level ?? null }))} />
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div className="grid content-start gap-8">
          {plans.draft && (
            <section aria-labelledby="draft">
              <SectionTitle id="draft">{t('draftPlan', { name: person.full_name.split(' ')[0] })}</SectionTitle>
              <IdpEditor plan={plans.draft} viewer="leader" indicatorOptions={(indicators ?? []).map((i) => ({ code: i.code, name: indicatorName(locale, i.code, i.name) }))} educatorName={person.full_name} />
            </section>
          )}
          <section aria-labelledby="goals">
            <SectionTitle id="goals" count={activeGoals.length}>{t('activeGoals')}</SectionTitle>
            {activeGoals.length === 0 ? (
              <p className="tend-card p-5 text-sm text-muted-foreground">{t('noPlan')}</p>
            ) : (
              <ul className="tend-card divide-y">
                {trajectories.map(({ g, pts }) => {
                  const mv = latestMove(pts);
                  return (
                    <li key={g.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                      <span className="grid gap-1">
                        <IndicatorTag code={g.indicator.code} name={g.indicator.name} className="self-start" />
                        <span className="text-xs text-muted-foreground">
                          {t('obsCount', { n: pts.length })}{mv ? t('moved', { from: mv.from, to: mv.to, weeks: mv.weeks }) : ''}
                        </span>
                      </span>
                      <LevelStones level={pts.at(-1)?.level ?? g.current_level} target={g.target_level} size="sm" />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          {activeGoals.some((g) => g.actions.length) && (
            <section aria-labelledby="plan-actions">
              <SectionTitle id="plan-actions" count={activeGoals.reduce((n, g) => n + g.actions.filter((a) => a.status === 'done').length, 0)}>
                {t('actionsDone')}
              </SectionTitle>
              <div className="tend-card grid gap-5 p-5">
                {activeGoals.filter((g) => g.actions.length).map((g) => (
                  <div key={g.id} className="grid gap-2">
                    <IndicatorTag code={g.indicator.code} name={g.indicator.name} className="self-start" />
                    <ul className="grid gap-3">{g.actions.map((a) => <ActionItem key={a.id} action={a} canAct={false} />)}</ul>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="grid content-start gap-6">
          {lna?.result && (
            <section className="tend-card p-5" aria-labelledby="snap">
              <SectionTitle id="snap">{t('lna')}</SectionTitle>
              <p className="text-sm"><span className="font-medium">{t('strengths')}</span> {lna.result.strengths.map((s) => area(s.subdomain)).join(', ')}</p>
              <p className="mt-1 text-sm"><span className="font-medium">{t('growing')}</span> {lna.result.growth_areas.map((s) => area(s.subdomain)).join(', ')}</p>
              {lna.result.agreement && <p className="mt-2 text-xs text-muted-foreground">{t('reflects', { answer: tsnap(lna.result.agreement === 'yes' ? 'agreeYes' : lna.result.agreement === 'partly' ? 'agreePartly' : 'agreeNo') })}</p>}
            </section>
          )}
          {plans.active && <ProposedActions idpId={plans.active.id} />}
          <CoachDigest educatorId={id} />
          <section className="tend-card p-5" aria-labelledby="timeline">
            <SectionTitle id="timeline">{t('timeline')}</SectionTitle>
            <ol className="grid gap-2">
              {(obs ?? []).map((o) => (
                <li key={o.id}>
                  <Link href={['scheduled', 'capturing'].includes(o.status) ? `/observe/${o.id}` : `/reviews/${o.id}`} className="flex items-center justify-between gap-3 rounded-md px-1 py-1.5 text-sm hover:bg-muted">
                    <span><span className="tabular-nums text-muted-foreground">{format.dateTime(new Date(o.scheduled_at), { day: 'numeric', month: 'short' })}</span> · {o.title}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">{ts.has(o.status) ? ts(o.status) : o.status} <ArrowRight className="size-3" aria-hidden /></span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
