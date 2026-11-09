import { ArrowRight, Mic } from 'lucide-react';
import { getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PageHeader, SectionTitle } from '@/components/tend/page-header';
import { getSession } from '@/lib/auth/session';
import { dateline } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { ScheduleForm } from './schedule-form';

export const metadata = { title: 'Observe' };

export default async function ObserveIndex() {
  const locale = await getLocale();
  const session = (await getSession())!;
  const centreId = session.memberships.find((m) => m.role === 'leader')?.centre_id;
  const supabase = await createClient();
  const [{ data: upcoming }, { data: educators }, { data: classes }] = await Promise.all([
    supabase.from('observation').select('id, title, status, scheduled_at, focus_goal_ids, educator:educator_id(full_name)').in('status', ['scheduled', 'capturing']).order('scheduled_at'),
    supabase.from('educator_profile').select('user_id, user:user_id(full_name)').eq('centre_id', centreId!),
    supabase.from('class').select('id, name').eq('centre_id', centreId!).order('name'),
  ]);
  const people = ((educators ?? []) as unknown as { user_id: string; user: { full_name: string } }[]).map((e) => ({ id: e.user_id, name: e.user.full_name })).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader dateline={dateline(new Date(), locale)} title="Observe" subtitle="Short, focused micro-observations. The educator chooses the focus; you capture, Tend drafts." />
      <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <section aria-labelledby="upcoming">
          <SectionTitle id="upcoming" count={(upcoming ?? []).length}>Upcoming and in progress</SectionTitle>
          <ul className="tend-card divide-y">
            {(upcoming ?? []).length === 0 && <li className="p-4 text-sm text-muted-foreground">Nothing scheduled yet.</li>}
            {(upcoming ?? []).map((o) => (
              <li key={o.id}>
                <Link href={`/observe/${o.id}`} className="tend-row group">
                  <Mic aria-hidden className={o.status === 'capturing' ? 'size-5 text-destructive' : 'size-5 text-primary'} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{(o.educator as unknown as { full_name: string }).full_name} · {o.title}</span>
                    <span className="block text-sm text-muted-foreground">
                      {new Date(o.scheduled_at).toLocaleString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' })}
                      {' · '}{o.status === 'capturing' ? 'capturing now' : (o.focus_goal_ids ?? []).length ? 'focus chosen' : 'waiting for focus'}
                    </span>
                  </span>
                  <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="schedule">
          <SectionTitle id="schedule">Schedule an observation</SectionTitle>
          <ScheduleForm educators={people} classes={classes ?? []} />
        </section>
      </div>
    </>
  );
}
