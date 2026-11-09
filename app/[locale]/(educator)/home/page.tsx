import { ArrowRight, CalendarClock, Mail, Target } from 'lucide-react';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/tend/empty-state';
import { IndicatorTag } from '@/components/tend/indicator-tag';
import { LevelStones } from '@/components/tend/level-stones';
import { PageHeader, SectionTitle } from '@/components/tend/page-header';
import { TryTomorrowCard } from '@/components/coach/try-tomorrow-card';
import { getSession } from '@/lib/auth/session';
import { loadPlans } from '@/lib/data/growth';
import { dateline, firstName } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Home' };

export default async function HomePage() {
  const t = await getTranslations();
  const format = await getFormatter();
  const locale = await getLocale();
  const session = (await getSession())!;
  const supabase = await createClient();
  const uid = session.userId;

  const [plans, { data: upcoming }, { data: shared }, { data: reflections }, { data: cards }] = await Promise.all([
    loadPlans(supabase, uid),
    supabase.from('observation').select('id, scheduled_at, title, focus_goal_ids, observer:observer_id(full_name)').eq('educator_id', uid).eq('status', 'scheduled').gte('scheduled_at', new Date(Date.now() - 3 * 3600_000).toISOString()).order('scheduled_at').limit(2),
    supabase.from('observation').select('id, title, shared_at, observer:observer_id(full_name)').eq('educator_id', uid).in('status', ['shared', 'acknowledged']).order('shared_at', { ascending: false }).limit(5),
    supabase.from('educator_response').select('observation_id').eq('educator_id', uid).eq('kind', 'reflection'),
    supabase.from('coaching_card').select('id, title, body, indicator:indicator_id(code, name), created_at').eq('educator_id', uid).eq('status', 'approved').order('created_at', { ascending: false }).limit(1),
  ]);
  const reflected = new Set((reflections ?? []).map((r) => r.observation_id));
  const awaiting = (shared ?? []).filter((o) => !reflected.has(o.id));
  const goals = plans.active?.goals ?? [];
  const card = cards?.[0] as unknown as { id: string; title: string; body: Record<string, string>; indicator: { code: string; name: string } | null } | undefined;

  return (
    <>
      <PageHeader dateline={dateline(new Date(), locale)} title={`Hi ${firstName(session.profile.full_name)}`} subtitle={t('app.tagline')}
        actions={<Link href="/preferences" className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground md:hidden">{t('nav.preferences')}</Link>} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="grid content-start gap-6">
          {awaiting.map((o) => (
            <Link key={o.id} href={`/feedback/${o.id}`} className="tend-card group flex items-center gap-4 border-l-4 border-l-primary p-5 hover:border-primary">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Mail aria-hidden className="size-5" /></span>
              <span className="grid flex-1 gap-0.5">
                <span className="font-semibold">New growth notes · {o.title ?? 'Observation'}</span>
                <span className="text-sm text-muted-foreground">From {(o.observer as unknown as { full_name: string }).full_name}. Take a moment to reflect first.</span>
              </span>
              <ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          ))}

          {(upcoming ?? []).map((o) => {
            const focused = (o.focus_goal_ids ?? []).length > 0;
            return (
              <section key={o.id} className="tend-card grid gap-3 p-5" aria-label="Upcoming observation">
                <p className="tend-dateline flex items-center gap-1.5 text-amber"><CalendarClock className="size-3.5" aria-hidden /> Coming up</p>
                <h2 className="text-lg font-semibold">{o.title ?? 'Observation'}</h2>
                <p className="text-sm text-muted-foreground">
                  <time dateTime={o.scheduled_at}>{format.dateTime(new Date(o.scheduled_at), { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })}</time>
                  {' · '}with {(o.observer as unknown as { full_name: string }).full_name}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button asChild className="min-h-11" variant={focused ? 'outline' : 'default'}>
                    <Link href={`/focus/${o.id}`}><Target aria-hidden /> {focused ? 'Change my focus' : 'Choose what I’d like feedback on'}</Link>
                  </Button>
                  {focused && <span className="text-sm text-success">Your focus is set</span>}
                </div>
              </section>
            );
          })}

          <section aria-labelledby="my-goals">
            <SectionTitle id="my-goals" count={goals.length} action={<Link href="/growth" className="text-sm text-primary hover:underline">My Growth</Link>}>
              My goals
            </SectionTitle>
            {goals.length === 0 ? (
              <EmptyState message={t('empty.goals')} actionLabel={t('empty.goalsAction')} href="/growth" />
            ) : (
              <ul className="tend-card divide-y">
                {goals.map((g) => (
                  <li key={g.id}>
                    <Link href={`/growth/goal/${g.id}`} className="tend-row flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <IndicatorTag code={g.indicator.code} name={g.indicator.name} />
                      <LevelStones level={g.current_level} target={g.target_level} size="sm" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="grid content-start gap-6">
          {card ? <TryTomorrowCard card={card} /> : (
            <section className="tend-card p-5 text-sm text-muted-foreground">Your “Try tomorrow” card appears here after your next growth notes.</section>
          )}
        </aside>
      </div>
    </>
  );
}
