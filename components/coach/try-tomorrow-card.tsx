'use client';
import { CheckCircle2, Lightbulb, Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { logTriedIt } from '@/app/actions/coach';

type Card = { id: string; title: string; body: Record<string, string>; indicator: { code: string; name: string } | null };

/** Micro-coaching card (PRD M5.1) with one-tap "Tried it" (M5.2). */
export function TryTomorrowCard({ card, compact = false }: { card: Card; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const rows: [string, string][] = [
    ['Why it matters', card.body.why],
    ['Try tomorrow', card.body.try_tomorrow],
    ['Say it like this', card.body.say_it],
    ['Adapt by age', card.body.adapt_by_age],
    ['Reflect after', card.body.reflect_after],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <article className="tend-card grid gap-3 p-5" aria-label={`Coaching card: ${card.title}`}>
      <p className="tend-dateline flex items-center gap-1.5 text-amber"><Lightbulb className="size-3.5" aria-hidden /> Try tomorrow</p>
      <h2 className="text-lg font-semibold leading-snug">{card.title}</h2>
      {card.indicator && <p className="text-xs text-muted-foreground">{card.indicator.code} {card.indicator.name}</p>}
      <dl className="grid gap-2.5">
        {(compact ? rows.slice(1, 3) : rows).map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt>
            <dd className={k === 'Say it like this' ? 'italic' : undefined}>{k === 'Try tomorrow' ? <span className="tend-mark">{v}</span> : v}</dd>
          </div>
        ))}
      </dl>
      {done ? (
        <p role="status" className="flex items-center gap-2 font-medium text-success"><CheckCircle2 className="size-5" aria-hidden /> Logged — well done for trying it.</p>
      ) : (
        <div className="grid gap-2">
          {showNote && <Textarea aria-label="Optional note" placeholder="How did it go? (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />}
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11 bg-success text-success-foreground hover:bg-success/90"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  try {
                    await logTriedIt(card.id, note);
                    setDone(true);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Could not log it');
                  }
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />} Tried it
            </Button>
            {!showNote && <Button variant="ghost" className="min-h-11" onClick={() => setShowNote(true)}>Add a note</Button>}
          </div>
        </div>
      )}
    </article>
  );
}
