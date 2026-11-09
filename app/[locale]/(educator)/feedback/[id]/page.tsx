import { ArrowLeft, Users } from 'lucide-react';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { AiLabel } from '@/components/tend/ai-label';
import { PageHeader, SectionTitle } from '@/components/tend/page-header';
import { TryTomorrowCard } from '@/components/coach/try-tomorrow-card';
import { getSession } from '@/lib/auth/session';
import type { NarrativeContent } from '@/lib/pipeline/types';
import { createClient } from '@/lib/supabase/server';
import { FeedbackView } from './feedback-view';
import { ReflectFirst } from './reflect-first';

export const metadata = { title: 'Growth notes' };

export default async function FeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = (await getSession())!;
  const supabase = await createClient();
  const { data: o } = await supabase
    .from('observation')
    .select('id, title, status, scheduled_at, educator_id, approver:approved_by(full_name)')
    .eq('id', id)
    .eq('educator_id', session.userId)
    .maybeSingle();
  if (!o || !['shared', 'acknowledged', 'discussed'].includes(o.status)) notFound();
  const reviewer = (o.approver as unknown as { full_name: string } | null)?.full_name ?? 'your Centre Leader';
  const { data: refl } = await supabase.from('educator_response').select('body').eq('observation_id', id).eq('kind', 'reflection').maybeSingle();

  const header = (
    <>
      <Link href="/home" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> Home</Link>
      <PageHeader dateline={`${o.title} · ${new Date(o.scheduled_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', timeZone: 'Asia/Singapore' })}`} title="Your growth notes" />
    </>
  );

  if (!refl) return <div className="mx-auto max-w-2xl">{header}<ReflectFirst obsId={id} reviewer={reviewer} /></div>;

  // Under RLS these rows are only visible now that the notes are shared AND you have reflected.
  const [{ data: narr }, { data: units }, { data: responses }, { data: cards }, { data: tags }] = await Promise.all([
    supabase.from('narrative').select('content').eq('observation_id', id).eq('is_final', true).single(),
    supabase.from('evidence_unit').select('id, text, start_ms').eq('observation_id', id),
    supabase.from('educator_response').select('kind, target_ref, value').eq('observation_id', id),
    supabase.from('coaching_card').select('id, title, body, indicator:indicator_id(code, name)').eq('observation_id', id).eq('status', 'approved'),
    supabase.from('tag').select('valence, indicator:indicator_id(code, name)').eq('observation_id', id),
  ]);
  const growCodes = [...new Set(((tags ?? []) as unknown as { valence: string; indicator: { code: string; name: string } }[]).filter((t) => t.valence === 'grow').map((t) => t.indicator.code))].slice(0, 2);
  const peers = (await Promise.all(growCodes.map(async (code) => ({ code, list: ((await supabase.rpc('peer_matches', { p_indicator_code: code })).data ?? []) as { full_name: string }[] })))).filter((p) => p.list.length);

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      {header}
      <div className="-mt-4"><AiLabel reviewer={reviewer} /></div>
      <blockquote className="rounded-xl bg-muted/70 px-4 py-3 text-sm"><span className="font-medium">Your reflection:</span> “{refl.body}”</blockquote>
      <FeedbackView
        obsId={id}
        content={narr!.content as NarrativeContent}
        units={(units ?? []).map((u) => ({ id: u.id, text: u.text, ms: u.start_ms }))}
        responded={(responses ?? []).filter((r) => r.kind !== 'reflection').map((r) => ({ kind: r.kind, target: r.target_ref, value: r.value }))}
      />
      {(cards ?? []).length > 0 && (
        <section aria-labelledby="cards-h" className="grid gap-3">
          <SectionTitle id="cards-h">Coaching cards</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            {(cards as unknown as { id: string; title: string; body: Record<string, string>; indicator: { code: string; name: string } | null }[]).map((c) => <TryTomorrowCard key={c.id} card={c} />)}
          </div>
        </section>
      )}
      {peers.length > 0 && (
        <section className="tend-card flex gap-3 p-5" aria-label="Peer Match">
          <Users className="size-5 shrink-0 text-amber" aria-hidden />
          <div className="text-sm">
            <p className="font-medium">Learn from a colleague</p>
            {peers.map((p) => <p key={p.code}>Watch <span className="font-medium">{p.list[0].full_name}</span> for 15 minutes — strong at {p.code}. Free and targeted.</p>)}
            <Link href="/learn" className="mt-1 inline-block text-primary underline underline-offset-2">See your learning pathway →</Link>
          </div>
        </section>
      )}
    </div>
  );
}
