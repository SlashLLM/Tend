import { ArrowLeft, Eye } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { CaptureStudio } from '@/components/capture/capture-studio';
import { IndicatorTag } from '@/components/tend/indicator-tag';
import { aiMode } from '@/lib/ai/availability';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Observe' };

export default async function ObservePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: o } = await supabase
    .from('observation')
    .select('id, title, status, scheduled_at, capture_started_at, focus_goal_ids, focus_note, educator_id, educator:educator_id(full_name), class:class_id(name)')
    .eq('id', id)
    .maybeSingle();
  if (!o) notFound();
  if (!['scheduled', 'capturing'].includes(o.status)) redirect(`/reviews/${id}`);

  // Pre-brief (PRD M4.3): focus, last levels, 3 look-fors — deterministic, no AI.
  const { data: goals } = await supabase
    .from('idp_goal')
    .select('id, current_level, target_level, indicator:indicator_id(id, code, name, look_fors), idp!inner(educator_id, status)')
    .eq('idp.educator_id', o.educator_id)
    .eq('idp.status', 'active');
  const all = (goals ?? []) as unknown as { id: string; current_level: number | null; target_level: number; indicator: { id: string; code: string; name: string; look_fors: string[] } }[];
  const focus = all.filter((g) => (o.focus_goal_ids ?? []).includes(g.id));
  const brief = focus.length ? focus : all.slice(0, 1);
  const { data: last } = await supabase
    .from('tag')
    .select('level, indicator_id, observation:observation_id!inner(scheduled_at, educator_id, status)')
    .eq('observation.educator_id', o.educator_id)
    .in('observation.status', ['shared', 'acknowledged', 'discussed'])
    .eq('state', 'accepted')
    .in('indicator_id', brief.map((g) => g.indicator.id));
  const lastFor = (indId: string) => {
    const rows = ((last ?? []) as unknown as { level: number; indicator_id: string; observation: { scheduled_at: string } }[])
      .filter((r) => r.indicator_id === indId)
      .sort((a, b) => b.observation.scheduled_at.localeCompare(a.observation.scheduled_at));
    if (!rows.length) return 'not yet observed';
    const weeks = Math.max(1, Math.round((Date.now() - new Date(rows[0].observation.scheduled_at).getTime()) / (7 * 86_400_000)));
    return `last seen at Level ${rows[0].level}, ${weeks} week${weeks === 1 ? '' : 's'} ago`;
  };
  const lookFors = brief.flatMap((g) => g.indicator.look_fors).slice(0, 3);
  const educator = (o.educator as unknown as { full_name: string }).full_name;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/today" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> Today</Link>
      <header className="tend-card mb-4 grid gap-3 p-4" aria-label="Pre-brief">
        <div>
          <p className="tend-dateline">{(o.class as unknown as { name: string } | null)?.name ?? 'Class'} · {o.title}</p>
          <h1 className="text-xl font-semibold">{educator}</h1>
        </div>
        {brief.length > 0 ? (
          <ul className="grid gap-2">
            {brief.map((g) => (
              <li key={g.id} className="grid gap-1">
                <IndicatorTag code={g.indicator.code} name={g.indicator.name} className="self-start" />
                <span className="text-xs text-muted-foreground">{focus.length ? 'Chosen focus' : 'Plan goal'} · {lastFor(g.indicator.id)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No plan goals yet — capture what you see.</p>
        )}
        {o.focus_note && <p className="rounded-md bg-muted px-3 py-2 text-sm">“{o.focus_note}”</p>}
        {lookFors.length > 0 && (
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Eye className="size-3.5" aria-hidden /> Look for</p>
            <ol className="grid list-decimal gap-0.5 pl-5 text-sm">{lookFors.map((l) => <li key={l}>{l}</li>)}</ol>
          </div>
        )}
      </header>
      <CaptureStudio
        obsId={o.id}
        initialStatus={o.status as 'scheduled' | 'capturing'}
        startedAt={o.capture_started_at}
        demo={process.env.DEMO_MODE === '1'}
        liveTranscription={aiMode() === 'luna'}
      />
    </div>
  );
}
