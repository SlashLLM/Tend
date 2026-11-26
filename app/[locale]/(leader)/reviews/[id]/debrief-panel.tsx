'use client';
import { CheckCircle2, Loader2, Timer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { completeDebrief } from '@/app/actions/review';
import type { Agenda } from '@/lib/debrief';

/** Debrief Mode (PRD M4.18): agenda, 15-minute timer, notes, agreed actions straight into the IDP. */
export function DebriefPanel({ obsId, agenda, completed, notes: initialNotes, canRun, goals, suggestedAction, suggestedGoal }: {
  obsId: string; agenda: Agenda; completed: string | null; notes: string; canRun: boolean; goals: { id: string; label: string }[]; suggestedAction: string; suggestedGoal: string | null;
}) {
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(15 * 60);
  const [notes, setNotes] = useState(initialNotes);
  const [action, setAction] = useState(suggestedAction);
  const [goal, setGoal] = useState(suggestedGoal ?? goals[0]?.id ?? '');
  const [pending, start] = useTransition();
  const t = useTranslations('debrief');

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);

  return (
    <section className="tend-card grid gap-4 p-5" aria-labelledby="debrief-h">
      <div className="flex items-center justify-between">
        <h2 id="debrief-h" className="text-base font-semibold">{t('title')}</h2>
        {completed ? (
          <span className="flex items-center gap-1 text-sm text-success"><CheckCircle2 className="size-4" aria-hidden /> {t('discussed')}</span>
        ) : running ? (
          <span className="flex items-center gap-1 font-mono text-sm tabular-nums" aria-live="off"><Timer className="size-4" aria-hidden />{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
        ) : null}
      </div>
      <ol className="grid gap-3 text-sm">
        <li><span className="font-semibold">1 · </span>{agenda.celebrate}</li>
        {agenda.questions.map((q, i) => <li key={i}><span className="font-semibold">{i + 2} · </span>{q}</li>)}
        <li><span className="font-semibold">{agenda.questions.length + 2} · </span>{agenda.decision}</li>
      </ol>
      {completed ? (
        notes && <p className="rounded-md bg-muted px-3 py-2 text-sm">{notes}</p>
      ) : !canRun ? null : !running ? (
        <Button className="min-h-11" onClick={() => setRunning(true)}><Timer aria-hidden /> {t('start')}</Button>
      ) : (
        <div className="grid gap-3">
          <Textarea aria-label={t('notesLabel')} placeholder={t('notesPlaceholder')} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="agreed">{t('agreed')}</label>
            <Input id="agreed" value={action} onChange={(e) => setAction(e.target.value)} className="min-h-11" />
            <select aria-label={t('goalFor')} className="min-h-11 w-full rounded-md border bg-card px-2 text-sm" value={goal} onChange={(e) => setGoal(e.target.value)}>
              {goals.length === 0 && <option value="">{t('noPlan')}</option>}
              {goals.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </div>
          <Button
            className="min-h-11"
            disabled={pending}
            onClick={() =>
              start(async () => {
                try {
                  await completeDebrief(obsId, notes, goal && action.trim().length >= 3 ? [{ goal_id: goal, description: action.trim() }] : [], agenda);
                  toast.success(t('done'));
                } catch (e) {
                  console.error(e);
                  toast.error(t('failed'));
                }
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />} {t('complete')}
          </Button>
        </div>
      )}
    </section>
  );
}
