import { ArrowLeft, MessageCircle, TrendingUp } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { ActionItem } from '@/components/growth/action-item';
import { TrajectoryChart } from '@/components/growth/trajectory-chart';
import { IndicatorTag } from '@/components/tend/indicator-tag';
import { LevelStones } from '@/components/tend/level-stones';
import { PageHeader, SectionTitle } from '@/components/tend/page-header';
import { getSession } from '@/lib/auth/session';
import { loadPlans, loadTrajectory } from '@/lib/data/growth';
import { collapseByObservation, latestMove } from '@/lib/trajectory';
import { createClient } from '@/lib/supabase/server';
import { formatMs } from '@/lib/levels';
import { pageTitle } from '@/lib/i18n/meta';

export const generateMetadata = pageTitle('goal');

export default async function GoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = (await getSession())!;
  const t = await getTranslations('goal');
  const tg = await getTranslations('growth');
  const format = await getFormatter();
  const supabase = await createClient();
  const plans = await loadPlans(supabase, session.userId, await getLocale());
  const goal = [...(plans.active?.goals ?? []), ...(plans.draft?.goals ?? [])].find((g) => g.id === id);
  if (!goal) notFound();
  const rows = await loadTrajectory(supabase, session.userId, goal.indicator.id);
  const points = collapseByObservation(rows);
  const move = latestMove(points);
  const latest = points.at(-1)?.level ?? goal.current_level;

  return (
    <>
      <Link href="/growth" className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> {tg('title')}</Link>
      <PageHeader
        dateline={t('dateline', { name: goal.indicator.subdomain_name })}
        title={goal.indicator.name}
        actions={<Button asChild variant="outline" className="min-h-11"><Link href={`/coach?goal=${goal.id}`}><MessageCircle aria-hidden /> {t('askCoach')}</Link></Button>}
      />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="grid content-start gap-6">
          <section className="tend-card grid gap-4 p-5">
            <IndicatorTag code={goal.indicator.code} name={goal.indicator.name} className="self-start" />
            <LevelStones level={latest} target={goal.target_level} />
            {move && (
              <p className="flex items-center gap-2 text-sm font-medium text-success">
                <TrendingUp className="size-4" aria-hidden /> {t('moved', { from: move.from, to: move.to, weeks: move.weeks })}
              </p>
            )}
            <TrajectoryChart points={points} target={goal.target_level} selfRating={goal.current_level} />
          </section>
          <section className="tend-card p-5" aria-labelledby="evidence">
            <SectionTitle id="evidence" count={rows.length}>{t('evidence')}</SectionTitle>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('evidenceEmpty')}</p>
            ) : (
              <ul className="grid gap-3">
                {[...rows].reverse().slice(0, 8).map((r, i) => (
                  <li key={i} className="grid gap-1 border-l-2 border-primary/30 pl-3">
                    <p className="text-xs text-muted-foreground">
                      {format.dateTime(new Date(r.at), { day: 'numeric', month: 'short', year: 'numeric' })} · {t('seenAt', { level: r.level })} · ▶ {formatMs(r.ms)}
                    </p>
                    <p className="text-sm">{r.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <div className="grid content-start gap-6">
          <section className="tend-card p-5" aria-labelledby="levels">
            <SectionTitle id="levels">{t('levelsTitle')}</SectionTitle>
            <dl className="grid gap-3">
              {(['1', '2', '3'] as const).map((l) => (
                <div key={l} className={Number(l) === goal.target_level ? 'rounded-lg bg-amber/10 p-2' : 'p-2'}>
                  <dt className="text-sm font-semibold">{t('level', { l })}{Number(l) === goal.target_level && <span className="ml-2 text-xs font-medium text-amber">{t('yourAim')}</span>}</dt>
                  <dd className="text-sm text-muted-foreground">{goal.indicator.level_descriptors[l]}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="tend-card p-5" aria-labelledby="lookfors">
            <SectionTitle id="lookfors">{t('lookFors')}</SectionTitle>
            <ul className="grid list-disc gap-1.5 pl-5 text-sm">{goal.indicator.look_fors.map((l) => <li key={l}>{l}</li>)}</ul>
          </section>
          <section className="tend-card p-5" aria-labelledby="actions">
            <SectionTitle id="actions" count={goal.actions.length}>{t('actions')}</SectionTitle>
            <ul className="grid gap-3 text-sm">
              {goal.actions.map((a) => <ActionItem key={a.id} action={a} canAct />)}
            </ul>
            <Button asChild variant="link" className="mt-2 h-auto p-0"><Link href={`/learn?goal=${goal.id}`}>{t('findLearning')}</Link></Button>
          </section>
        </div>
      </div>
    </>
  );
}
