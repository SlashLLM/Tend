'use client';
import { CheckCircle2, Lightbulb, Loader2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { logTriedIt } from '@/app/actions/coach';

type Card = { id: string; title: string; body: Record<string, string>; indicator: { code: string; name: string } | null };

/** Micro-coaching card (PRD M5.1) with one-tap "Tried it" (M5.2). */
export function TryTomorrowCard({ card, compact = false, triedOn = null }: { card: Card; compact?: boolean; /** Latest logged try (YYYY-MM-DD), from the server. */ triedOn?: string | null }) {
  const [pending, start] = useTransition();
  // Starts from the saved attempt, so the card still shows "tried" after a refresh.
  const [done, setDone] = useState(triedOn !== null);
  const [justLogged, setJustLogged] = useState(false);
  const format = useFormatter();
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const t = useTranslations('card');
  const rows = (['why', 'try_tomorrow', 'say_it', 'adapt_by_age', 'reflect_after'] as const)
    .map((k) => [k, card.body[k]] as const)
    .filter(([, v]) => v);

  return (
    <article className="tend-card grid gap-3 p-5" aria-label={t('aria', { title: card.title })}>
      <p className="tend-dateline flex items-center gap-1.5 text-amber"><Lightbulb className="size-3.5" aria-hidden /> {t('try_tomorrow')}</p>
      <h2 className="text-lg font-semibold leading-snug">{card.title}</h2>
      {card.indicator && <p className="text-xs text-muted-foreground">{card.indicator.code} {card.indicator.name}</p>}
      <dl className="grid gap-2.5">
        {(compact ? rows.slice(1, 3) : rows).map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(k)}</dt>
            <dd className={k === 'say_it' ? 'italic' : undefined}>{k === 'try_tomorrow' ? <span className="tend-mark">{v}</span> : v}</dd>
          </div>
        ))}
      </dl>
      {done ? (
        <div className="grid gap-2">
          <p role="status" className="flex items-center gap-2 font-medium text-success">
            <CheckCircle2 className="size-5" aria-hidden />
            {justLogged || !triedOn ? t('logged') : t('triedOn', { date: format.dateTime(new Date(`${triedOn}T00:00:00+08:00`), { day: 'numeric', month: 'short' }) })}
          </p>
          <Button variant="ghost" className="min-h-11 justify-self-start" onClick={() => { setDone(false); setNote(''); setShowNote(false); }}>{t('triedAgain')}</Button>
        </div>
      ) : (
        <div className="grid gap-2">
          {showNote && <Textarea aria-label={t('noteLabel')} placeholder={t('notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />}
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11 bg-success text-success-foreground hover:bg-success/90"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  try {
                    await logTriedIt(card.id, note);
                    setDone(true);
                    setJustLogged(true);
                  } catch (e) {
                    console.error(e);
                    toast.error(t('logFailed'));
                  }
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />} {t('triedIt')}
            </Button>
            {!showNote && <Button variant="ghost" className="min-h-11" onClick={() => setShowNote(true)}>{t('addNote')}</Button>}
          </div>
        </div>
      )}
    </article>
  );
}
