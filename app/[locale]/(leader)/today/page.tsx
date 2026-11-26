import { ArrowRight, CalendarClock, ClipboardCheck, Clock, HandHelping, MessagesSquare, PenSquare, TimerOff, UserRoundPlus } from 'lucide-react';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/tend/empty-state';
import { PageHeader, SectionTitle } from '@/components/tend/page-header';
import { getSession } from '@/lib/auth/session';
import { dateline, firstName } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { buildTodayQueue, thisWeek, type QueueObs } from '@/lib/today';
import { pageTitle } from '@/lib/i18n/meta';

export const generateMetadata = pageTitle('today');

const KIND = {
  review: { icon: ClipboardCheck, label: 'today.kindReview', tone: 'text-primary', href: (id: string) => `/reviews/${id}` },
  debrief: { icon: MessagesSquare, label: 'today.kindDebrief', tone: 'text-amber', href: (id: string) => `/reviews/${id}` },
  overdue: { icon: TimerOff, label: 'today.kindOverdue', tone: 'text-muted-foreground', href: (id: string) => `/observe/${id}` },
} as const;

export default async function TodayPage() {
  const t = await getTranslations();
  const format = await getFormatter();
  const locale = await getLocale();
  const session = (await getSession())!;
  const centreId = session.memberships.find((m) => m.role === 'leader')?.centre_id ?? null;
  const supabase = await createClient();

  const [{ data }, { data: drafts }, { data: requested }, metrics] = await Promise.all([
    supabase.from('observation').select('id, status, scheduled_at, title, shared_at, educator:educator_id(full_name)').in('status', ['scheduled', 'ai_draft', 'in_review', 'acknowledged']).order('scheduled_at'),
    supabase.from('idp').select('id, educator_id, educator:educator_id(full_name), leader_confirmed_at').eq('status', 'draft').is('leader_confirmed_at', null),
    supabase.from('observation_request').select('id, note, educator:educator_id(full_name)').eq('status', 'open').order('created_at'),
    centreId ? supabase.rpc('sandbox_metrics', { p_centre: centreId }) : Promise.resolve({ data: null }),
  ]);

  const rows: QueueObs[] = (data ?? []).map((r) => ({
    id: r.id, status: r.status, scheduled_at: r.scheduled_at, title: r.title, shared_at: r.shared_at,
    educator_name: (r.educator as unknown as { full_name: string } | null)?.full_name ?? '—',
  }));
  const now = new Date();
  const queue = buildTodayQueue(rows, now);
  const week = thisWeek(rows, now);
  const m = metrics.data as null | { hours_saved_this_term: number; documentation_minutes: { value: number; reduction: number } };
  const plans = (drafts ?? []) as unknown as { id: string; educator_id: string; educator: { full_name: string } }[];
  const requests = (requested ?? []) as unknown as { id: string; note: string | null; educator: { full_name: string } }[];
  const total = requests.length + queue.length + plans.length;

  return (
    <>
      <PageHeader
        dateline={dateline(now, locale)}
        title={t('today.greeting', { name: firstName(session.profile.full_name) })}
        subtitle={total === 0 ? t('today.nothing') : t('today.count', { n: total })}
        actions={<Button asChild className="min-h-11"><Link href="/observe"><PenSquare aria-hidden /> {t('today.schedule')}</Link></Button>}
      />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="needs-you">
          <SectionTitle id="needs-you" count={total}>{t('today.needsYou')}</SectionTitle>
          {total === 0 ? (
            <EmptyState message={t('empty.reviews')} actionLabel={t('empty.reviewsAction')} href="/observe" />
          ) : (
            <ul className="tend-card divide-y overflow-hidden">
              {requests.map((r) => (
                <li key={r.id}>
                  <Link href={`/observe?request=${r.id}`} className="tend-row group">
                    <HandHelping aria-hidden className="size-5 shrink-0 text-amber" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{r.educator.full_name}</span>
                      <span className="block truncate text-sm text-muted-foreground">{r.note ? t('today.askedNote', { note: r.note }) : t('today.asked')}</span>
                    </span>
                    <span className="hidden text-sm text-muted-foreground sm:inline">{t('today.pickTime')}</span>
                    <span className="sr-only sm:hidden">{t('today.pickTime')}</span>
                    <ArrowRight aria-hidden className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
              {queue.map((q) => {
                const k = KIND[q.kind];
                const Icon = k.icon;
                return (
                  <li key={`${q.kind}-${q.obs.id}`}>
                    <Link href={k.href(q.obs.id)} className="tend-row group">
                      <Icon aria-hidden className={`size-5 shrink-0 ${k.tone}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{q.obs.educator_name}</span>
                        <span className="block truncate text-sm text-muted-foreground">{q.obs.title ?? t('common.observation')}</span>
                      </span>
                      <span className="hidden text-sm text-muted-foreground sm:inline">{t(k.label)}</span>
                      <span className="sr-only sm:hidden">{t(k.label)}</span>
                      <ArrowRight aria-hidden className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                );
              })}
              {plans.map((p) => (
                <li key={p.id}>
                  <Link href={`/educators/${p.educator_id}`} className="tend-row group">
                    <UserRoundPlus aria-hidden className="size-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{p.educator.full_name}</span>
                      <span className="block text-sm text-muted-foreground">{t('today.draftPlan')}</span>
                    </span>
                    <span className="hidden text-sm text-muted-foreground sm:inline">{t('today.shapePlan')}</span>
                    <span className="sr-only sm:hidden">{t('today.shapePlan')}</span>
                    <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="grid content-start gap-6">
          <section className="tend-card p-5" aria-labelledby="week">
            <SectionTitle id="week" count={week.length}><CalendarClock className="mr-1.5 inline size-4" aria-hidden />{t('today.thisWeek')}</SectionTitle>
            {week.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('empty.observations')}</p>
            ) : (
              <ul className="grid gap-3">
                {week.map((o) => (
                  <li key={o.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <Link href={`/observe/${o.id}`} className="font-medium hover:underline">{o.educator_name}<span className="font-normal text-muted-foreground"> · {o.title ?? t('common.observation')}</span></Link>
                    <time dateTime={o.scheduled_at} className="shrink-0 tabular-nums text-muted-foreground">
                      {format.dateTime(new Date(o.scheduled_at), { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {m && (
            <section className="tend-card grid gap-1 p-5" aria-labelledby="saved">
              <p id="saved" className="tend-dateline flex items-center gap-1.5"><Clock className="size-3.5" aria-hidden /> {t('today.timeSaved')}</p>
              <p className="font-heading text-4xl font-semibold tabular-nums">{m.hours_saved_this_term}<span className="ml-1 text-lg font-medium text-muted-foreground">{t('today.hours')}</span></p>
              <p className="text-sm text-muted-foreground">
                {t.rich('today.perWriteUp', { min: m.documentation_minutes?.value ?? '—', b: (c) => <span className="tend-mark font-medium text-foreground">{c}</span> })}
              </p>
              <Link href="/metrics" className="mt-2 text-sm text-primary hover:underline">{t('today.allMetrics')}</Link>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
