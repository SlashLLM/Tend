import { ArrowRight, Mic } from 'lucide-react';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PageHeader, SectionTitle } from '@/components/tend/page-header';
import { getSession } from '@/lib/auth/session';
import { dateline } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { ScheduleForm } from './schedule-form';
import { pageTitle } from '@/lib/i18n/meta';

export const generateMetadata = pageTitle('observe');

export default async function ObserveIndex({ searchParams }: { searchParams: Promise<{ request?: string }> }) {
  const { request: requestId } = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations('observe');
  const format = await getFormatter();
  const session = (await getSession())!;
  const centreId = session.memberships.find((m) => m.role === 'leader')?.centre_id;
  const supabase = await createClient();
  const [{ data: upcoming }, { data: educators }, { data: classes }, { data: req }] = await Promise.all([
    supabase.from('observation').select('id, title, status, scheduled_at, focus_goal_ids, educator:educator_id(full_name)').in('status', ['scheduled', 'capturing']).order('scheduled_at'),
    supabase.from('educator_profile').select('user_id, user:user_id(full_name)').eq('centre_id', centreId!),
    supabase.from('class').select('id, name').eq('centre_id', centreId!).order('name'),
    // A stale or foreign request id simply matches nothing (RLS + status filter), so the form falls back to a blank schedule.
    requestId && /^[0-9a-f-]{36}$/i.test(requestId)
      ? supabase.from('observation_request').select('id, note, educator_id, educator:educator_id(full_name)').eq('id', requestId).eq('status', 'open').maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const prefill = req
    ? { id: req.id, educatorId: req.educator_id, educatorName: (req.educator as unknown as { full_name: string }).full_name, note: req.note }
    : null;
  const people = ((educators ?? []) as unknown as { user_id: string; user: { full_name: string } }[]).map((e) => ({ id: e.user_id, name: e.user.full_name })).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader dateline={dateline(new Date(), locale)} title={t('title')} subtitle={t('subtitle')} />
      <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <section aria-labelledby="upcoming">
          <SectionTitle id="upcoming" count={(upcoming ?? []).length}>{t('upcoming')}</SectionTitle>
          <ul className="tend-card divide-y">
            {(upcoming ?? []).length === 0 && <li className="p-4 text-sm text-muted-foreground">{t('nothing')}</li>}
            {(upcoming ?? []).map((o) => (
              <li key={o.id}>
                <Link href={`/observe/${o.id}`} className="tend-row group">
                  <Mic aria-hidden className={o.status === 'capturing' ? 'size-5 text-destructive' : 'size-5 text-primary'} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{(o.educator as unknown as { full_name: string }).full_name} · {o.title}</span>
                    <span className="block text-sm text-muted-foreground">
                      {format.dateTime(new Date(o.scheduled_at), { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                      {' · '}{o.status === 'capturing' ? t('capturingNow') : (o.focus_goal_ids ?? []).length ? t('focusChosen') : t('waitingFocus')}
                    </span>
                  </span>
                  <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="schedule">
          <SectionTitle id="schedule">{t('schedule')}</SectionTitle>
          <ScheduleForm key={prefill?.id ?? 'blank'} educators={people} classes={classes ?? []} request={prefill} />
        </section>
      </div>
    </>
  );
}
