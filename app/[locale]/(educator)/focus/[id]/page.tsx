import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { PageHeader } from '@/components/tend/page-header';
import { getSession } from '@/lib/auth/session';
import { loadPlans } from '@/lib/data/growth';
import { createClient } from '@/lib/supabase/server';
import { FocusForm } from './focus-form';

export const metadata = { title: 'Choose your focus' };

export default async function FocusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = (await getSession())!;
  const supabase = await createClient();
  const { data: obs } = await supabase.from('observation').select('id, title, scheduled_at, status, focus_goal_ids, focus_note, observer:observer_id(full_name)').eq('id', id).eq('educator_id', session.userId).maybeSingle();
  if (!obs) notFound();
  const plans = await loadPlans(supabase, session.userId);
  const goals = (plans.active?.goals ?? []).map((g) => ({ id: g.id, code: g.indicator.code, name: g.indicator.name, current: g.current_level, target: g.target_level }));
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/home" className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> Home</Link>
      <PageHeader
        dateline={`${obs.title ?? 'Observation'} · ${new Date(obs.scheduled_at).toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' })}`}
        title="What would you like feedback on?"
        subtitle={`Choose up to two of your goals. ${(obs.observer as unknown as { full_name: string }).full_name} will look for these.`}
      />
      {obs.status !== 'scheduled' ? (
        <p className="tend-card p-5 text-muted-foreground">This observation has started, so the focus is locked.</p>
      ) : (
        <FocusForm obsId={obs.id} goals={goals} initial={obs.focus_goal_ids ?? []} initialNote={obs.focus_note ?? ''} />
      )}
    </div>
  );
}
