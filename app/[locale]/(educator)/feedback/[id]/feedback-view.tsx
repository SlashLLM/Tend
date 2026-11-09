'use client';
import { Check, MessageSquarePlus, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FeedbackCard } from '@/components/tend/feedback-card';
import { formatMs } from '@/lib/levels';
import type { NarrativeContent } from '@/lib/pipeline/types';
import { respond } from '@/app/actions/feedback';

type Props = {
  obsId: string;
  content: NarrativeContent;
  units: { id: string; text: string; ms: number }[];
  responded: { kind: string; target: string | null; value: string | null }[];
};

/** Glows first, then Grows with "I agree" / "Add context", one Next step, and a thumbs rating. */
export function FeedbackView({ obsId, content, units, responded }: Props) {
  const [quote, setQuote] = useState<{ ms: number; text: string } | null>(null);
  const [done, setDone] = useState<Record<string, 'agree' | 'context'>>(
    Object.fromEntries(responded.filter((r) => r.target && (r.kind === 'agree' || r.kind === 'context')).map((r) => [r.target!, r.kind as 'agree' | 'context'])),
  );
  const [ctxFor, setCtxFor] = useState<string | null>(null);
  const [ctx, setCtx] = useState('');
  const [thumb, setThumb] = useState<string | null>(responded.findLast?.((r) => r.kind === 'thumbs')?.value ?? null);
  const [pending, start] = useTransition();
  const byId = new Map(units.map((u) => [u.id, u]));
  const ev = (ids: string[]) => ids.filter((i) => byId.has(i)).map((i) => ({ id: i, ms: byId.get(i)!.ms }));
  const onSeek = (ms: number) => setQuote(units.find((u) => u.ms === ms) ?? null);

  const send = (fn: () => Promise<unknown>, after: () => void) =>
    start(async () => {
      try {
        await fn();
        after();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not save');
      }
    });

  return (
    <div className="grid gap-4">
      {quote && (
        <div role="status" className="rounded-xl border-l-4 border-primary bg-card px-4 py-3 text-sm shadow-sm">
          <span className="font-mono text-xs text-muted-foreground">▶ {formatMs(quote.ms)}</span> “{quote.text}”
          <button className="ml-2 text-xs text-muted-foreground underline" onClick={() => setQuote(null)}>close</button>
        </div>
      )}
      {content.glows.map((g, i) => <FeedbackCard key={`g${i}`} kind="glow" text={g.text} evidence={ev(g.evidence_ids)} onSeek={onSeek} />)}
      {content.grows.map((g, i) => {
        const key = `grow:${i}`;
        return (
          <FeedbackCard key={key} kind="grow" text={g.text} evidence={ev(g.evidence_ids)} onSeek={onSeek}>
            {done[key] ? (
              <p className="flex items-center gap-1.5 text-sm text-success"><Check className="size-4" aria-hidden /> {done[key] === 'agree' ? 'You agreed' : 'Context added'}</p>
            ) : ctxFor === key ? (
              <div className="grid gap-2">
                <Textarea aria-label="Your context" value={ctx} onChange={(e) => setCtx(e.target.value)} placeholder="What should your leader know?" />
                <div className="flex gap-2">
                  <Button size="sm" className="min-h-11" disabled={pending || ctx.trim().length < 2} onClick={() => send(() => respond(obsId, 'context', key, ctx), () => { setDone((d) => ({ ...d, [key]: 'context' })); setCtxFor(null); setCtx(''); })}>Send</Button>
                  <Button size="sm" variant="ghost" className="min-h-11" onClick={() => setCtxFor(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="min-h-11" disabled={pending} onClick={() => send(() => respond(obsId, 'agree', key), () => setDone((d) => ({ ...d, [key]: 'agree' })))}><Check aria-hidden /> I agree</Button>
                <Button size="sm" variant="ghost" className="min-h-11" onClick={() => setCtxFor(key)}><MessageSquarePlus aria-hidden /> Add context</Button>
              </div>
            )}
          </FeedbackCard>
        );
      })}
      <FeedbackCard kind="next" text={content.next_step.text} evidence={ev(content.next_step.evidence_ids)} onSeek={onSeek} />
      <div className="tend-card flex flex-wrap items-center gap-3 p-4">
        <p className="text-sm font-medium">Were these notes helpful?</p>
        <div className="flex gap-2" role="group" aria-label="Rate these notes">
          {(['up', 'down'] as const).map((v) => (
            <Button key={v} size="icon" variant={thumb === v ? 'default' : 'outline'} className="size-11" aria-pressed={thumb === v} aria-label={v === 'up' ? 'Helpful' : 'Not helpful'} disabled={pending}
              onClick={() => send(() => respond(obsId, 'thumbs', null, undefined, v), () => setThumb(v))}>
              {v === 'up' ? <ThumbsUp aria-hidden /> : <ThumbsDown aria-hidden />}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
