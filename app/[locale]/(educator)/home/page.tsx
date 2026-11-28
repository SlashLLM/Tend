import { ArrowRight, Target } from 'lucide-react';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/tend/empty-state';
import { IndicatorTag } from '@/components/tend/indicator-tag';
import { LevelStones } from '@/components/tend/level-stones';
import { AiLabel } from '@/components/tend/ai-label';
import { PageHeader, SectionTitle } from '@/components/tend/page-header';
import { TryTomorrowCard } from '@/components/coach/try-tomorrow-card';
import { Letter, LetterTitle } from '@/components/home/letter';
import { getSession } from '@/lib/auth/session';
import { loadPlans } from '@/lib/data/growth';
import { firstName, sgDate } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { PeerRequestCard, type IncomingPeerRequest } from './peer-request-card';
import { RequestObservation } from './request-observation';
import { indicatorName } from '@/lib/i18n/content';
import { pageTitle } from '@/lib/i18n/meta';

export const generateMetadata = pageTitle('home');

type Named = { full_name: string } | null;
const nameOf = (v: unknown) => (v as Named)?.full_name ?? null;

/**
 * Educator Home: a letterbox. Everything waiting reads as a letter from a named person
 * (growth notes, a peer request, an upcoming observation, a coaching card), each with one reply.
 */
export default async function HomePage() {
  const t = await getTranslations();
  const format = await getFormatter();
  const locale = await getLocale();
  const session = (await getSession())!;
  const supabase = await createClient();
  const uid = session.userId;

  const [plans, { data: openRequest }, { count: inFlight }, { data: upcoming }, { data: shared }, { data: reflections }, { data: cards }] = await Promise.all([
    loadPlans(supabase, uid, locale),
    supabase.from('observation_request').select('id, note, created_at').eq('educator_id', uid).eq('status', 'open').maybeSingle(),
    // Same condition request_observation() enforces: anything scheduled or being captured blocks a new request.
    supabase.from('observation').select('id', { count: 'exact', head: true }).eq('educator_id', uid).in('status', ['scheduled', 'capturing']),
    supabase.from('observation').select('id, scheduled_at, title, focus_goal_ids, observer:observer_id(full_name)').eq('educator_id', uid).eq('status', 'scheduled').gte('scheduled_at', new Date(Date.now() - 3 * 3600_000).toISOString()).order('scheduled_at').limit(2),
    supabase.from('observation').select('id, title, shared_at, observer:observer_id(full_name)').eq('educator_id', uid).in('status', ['shared', 'acknowledged']).order('shared_at', { ascending: false }).limit(8),
    supabase.from('educator_response').select('observation_id').eq('educator_id', uid).eq('kind', 'reflection'),
    supabase.from('coaching_card').select('id, title, body, indicator:indicator_id(code, name), created_at, observation:observation_id(observer:observer_id(full_name))').eq('educator_id', uid).eq('status', 'approved').order('created_at', { ascending: false }).limit(1),
  ]);
  // Peer Match: requests waiting for me, and agreed sessions where I watch or am watched.
  const { data: peerRows } = await supabase
    .from('peer_observation')
    .select('id, status, observer_id, peer_id, indicator_code, proposed_at, scheduled_at, request_note, peer_note, created_at, observer:observer_id(full_name), peer:peer_id(full_name), action:idp_action_id(idp_goal_id)')
    .or(`and(peer_id.eq.${uid},status.eq.requested),and(status.eq.accepted,or(observer_id.eq.${uid},peer_id.eq.${uid}))`)
    .order('created_at');
  type PeerRow = {
    id: string; status: string; observer_id: string; peer_id: string; indicator_code: string; proposed_at: string | null; scheduled_at: string | null; created_at: string | null;
    request_note: string | null; peer_note: string | null; observer: { full_name: string } | null; peer: { full_name: string } | null; action: { idp_goal_id: string } | null;
  };
  const peer = (peerRows ?? []) as unknown as PeerRow[];
  const codes = [...new Set(peer.map((p) => p.indicator_code))];
  const { data: inds } = codes.length ? await supabase.from('indicator').select('code, name').in('code', codes) : { data: [] };
  const indName = (c: string) => `${c} ${indicatorName(locale, c, (inds ?? []).find((i) => i.code === c)?.name ?? '')}`.trim();
  const incoming: IncomingPeerRequest[] = peer
    .filter((p) => p.status === 'requested' && p.peer_id === uid)
    .map((p) => ({ id: p.id, observerName: p.observer?.full_name ?? t('common.aColleague'), indicator: indName(p.indicator_code), proposedAt: p.proposed_at, note: p.request_note, sentAt: p.created_at }));
  const sessions = peer.filter((p) => p.status === 'accepted' && p.scheduled_at).sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!));
  const now = Date.now();

  const reflected = new Set((reflections ?? []).map((r) => r.observation_id));
  const awaiting = (shared ?? []).filter((o) => !reflected.has(o.id));
  const earlier = (shared ?? []).filter((o) => reflected.has(o.id)).slice(0, 3);
  const goals = plans.active?.goals ?? [];
  const card = cards?.[0] as unknown as
    | { id: string; title: string; body: Record<string, string>; indicator: { code: string; name: string } | null; created_at: string; observation: { observer: Named } | null }
    | undefined;
  const { data: tries } = card ? await supabase.from('strategy_attempt').select('tried_on').eq('coaching_card_id', card.id).order('tried_on', { ascending: false }).limit(1) : { data: [] };
  const cardTriedOn = (tries?.[0]?.tried_on as string | undefined) ?? null;
  const cardReviewer = card?.observation?.observer?.full_name ?? null;
  const showComposer = (inFlight ?? 0) === 0;

  // Who is waiting on you, by first name, for the summary line.
  const senders = [
    ...awaiting.map((o) => nameOf(o.observer)),
    ...incoming.map((r) => r.observerName),
    ...(upcoming ?? []).map((o) => nameOf(o.observer)),
    ...sessions.map((s) => (s.observer_id === uid ? s.peer?.full_name : s.observer?.full_name) ?? null),
  ].filter((n): n is string => !!n).map(firstName);
  const people = [...new Set(senders)];
  const waiting = awaiting.length + incoming.length + (upcoming ?? []).length + sessions.length;
  const summary = waiting > 0
    ? t('home.summary', { count: waiting, names: format.list(people, { type: 'conjunction' }) })
    : card ? t('home.summaryQuiet') : t('home.summaryNone');

  const fmtWhen = (iso: string) => sgDate(new Date(iso), locale, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
  let i = 0;

  return (
    <>
      <PageHeader title={t('home.greeting', { name: firstName(session.profile.full_name) })} subtitle={summary}
        className="relative md:mb-10 md:[&_h1]:text-[2.5rem]"
        actions={<Link href="/preferences" className="absolute right-0 top-0 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground md:hidden">{t('nav.preferences')}</Link>} />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
        <div className="grid content-start gap-4" aria-label={t('home.letters')} role="region">
          {awaiting.map((o) => {
            const from = nameOf(o.observer) ?? t('common.aColleague');
            return (
              <Letter key={o.id} sender={{ kind: 'person', name: from }} kind={t('home.kindNotes')} at={o.shared_at} unread index={i++} className="tend-letter-lift">
                <LetterTitle>
                  <Link href={`/feedback/${o.id}`} className="after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring">
                    {t('home.newNotes', { title: o.title ?? t('common.observation') })}
                  </Link>
                </LetterTitle>
                <p className="max-w-prose text-muted-foreground">{t('home.notesBody')}</p>
                <span aria-hidden className="mt-1 inline-flex min-h-11 w-max items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-[gap] duration-200 group-hover/letter:gap-3">
                  {t('home.reflectFirst')} <ArrowRight className="size-4" />
                </span>
              </Letter>
            );
          })}

          {incoming.map((r) => <PeerRequestCard key={r.id} req={r} index={i++} />)}

          {(upcoming ?? []).map((o) => {
            const focused = (o.focus_goal_ids ?? []).length > 0;
            const from = nameOf(o.observer) ?? t('common.aColleague');
            return (
              <Letter key={o.id} as="section" sender={{ kind: 'person', name: from }} kind={t('home.kindObservation')} at={o.scheduled_at} unread={!focused} index={i++} aria-label={t('home.upcoming')}>
                <LetterTitle>{o.title ?? t('common.observation')}</LetterTitle>
                <p className="text-muted-foreground">
                  <time dateTime={o.scheduled_at}>{fmtWhen(o.scheduled_at)}</time>
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <Button asChild className="min-h-11" variant={focused ? 'outline' : 'default'}>
                    <Link href={`/focus/${o.id}`}><Target aria-hidden /> {focused ? t('home.changeFocus') : t('home.chooseFocus')}</Link>
                  </Button>
                  {focused && <span className="text-sm font-medium text-success">{t('home.focusSet')}</span>}
                </div>
              </Letter>
            );
          })}

          {sessions.map((s) => {
            const watching = s.observer_id === uid;
            const other = (watching ? s.peer?.full_name : s.observer?.full_name) ?? t('home.yourColleague');
            const due = new Date(s.scheduled_at!).getTime() <= now + 3600_000;
            return (
              <Letter key={s.id} as="section" sender={{ kind: 'person', name: other }} kind={t('home.peerObservation15')} at={s.scheduled_at} index={i++} aria-label={t('home.peerObservation')}>
                <LetterTitle>{watching ? t('home.youreWatching', { name: other }) : t('home.isWatchingYou', { name: firstName(other) })}</LetterTitle>
                <p className="max-w-prose text-muted-foreground">
                  <time dateTime={s.scheduled_at!}>{fmtWhen(s.scheduled_at!)}</time>
                  {' · '}{indName(s.indicator_code)}
                </p>
                {s.peer_note && <blockquote className="max-w-prose rounded-xl bg-muted/70 px-4 py-3 italic">“{s.peer_note}”</blockquote>}
                {watching && s.action && (
                  <div className="mt-1">
                    <Button asChild className="min-h-11" variant={due ? 'default' : 'outline'}>
                      <Link href={`/growth/goal/${s.action.idp_goal_id}`}>{due ? t('home.recordNoticed') : t('home.seeGoal')} <ArrowRight aria-hidden /></Link>
                    </Button>
                  </div>
                )}
              </Letter>
            );
          })}

          {card && (
            <Letter sender={{ kind: 'coach' }} kind={t('home.kindCoach')} at={card.created_at} index={i++} aria-label={t('card.aria', { title: card.title })}>
              <TryTomorrowCard card={card} triedOn={cardTriedOn} compact bare />
              {cardReviewer && <AiLabel reviewer={cardReviewer} />}
            </Letter>
          )}

          {showComposer && <RequestObservation open={openRequest} index={i++} />}

          {i === 0 && (
            <EmptyState message={t('home.caughtUp')} actionLabel={t('home.caughtUpAction')} href="/reflect" />
          )}
        </div>

        <aside className="grid content-start gap-10">
          <section aria-labelledby="my-goals">
            <SectionTitle id="my-goals" count={goals.length} action={<Link href="/growth" className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">{t('home.myGrowth')}</Link>}>
              {t('home.myGoals')}
            </SectionTitle>
            {goals.length === 0 ? (
              <EmptyState message={t('empty.goals')} actionLabel={t('empty.goalsAction')} href="/growth" className="py-8" />
            ) : (
              <ul className="tend-card divide-y overflow-hidden">
                {goals.map((g) => (
                  <li key={g.id}>
                    <Link href={`/growth/goal/${g.id}`} className="grid gap-3 px-4 py-4 transition-colors duration-150 hover:bg-muted/60">
                      <IndicatorTag code={g.indicator.code} name={g.indicator.name} className="justify-self-start" />
                      <LevelStones level={g.current_level} target={g.target_level} size="sm" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {earlier.length > 0 && (
            <section aria-labelledby="earlier-letters">
              <SectionTitle id="earlier-letters">{t('home.earlier')}</SectionTitle>
              <ul className="grid gap-1">
                {earlier.map((o) => (
                  <li key={o.id}>
                    <Link href={`/feedback/${o.id}`} className="group flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 transition-colors duration-150 hover:bg-card">
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate font-medium">{o.title ?? t('common.observation')}</span>
                        <span className="text-sm text-muted-foreground">
                          {t('home.earlierFrom', { name: nameOf(o.observer) ?? t('common.aColleague') })}
                          {o.shared_at && <> · <time dateTime={o.shared_at}>{sgDate(new Date(o.shared_at), locale, { day: 'numeric', month: 'short' })}</time></>}
                        </span>
                      </span>
                      <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
