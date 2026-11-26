'use client';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { areaName, scenarioOption, scenarioPrompt } from '@/lib/i18n/content';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { LevelStones } from '@/components/tend/level-stones';
import { cn } from '@/lib/utils';
import { completeLna, saveLnaAnswer } from '@/app/actions/lna';
import { CONFIDENCE, SUBDOMAIN_NAMES, type Question } from '@/lib/lna/content';
import type { Answers } from '@/lib/lna/score';

type Props = { attemptId: string; questions: Question[]; initial: Answers; locale: string };

export function LnaStepper({ attemptId, questions, initial, locale }: Props) {
  const router = useRouter();
  const t = useTranslations('lna');
  const area = (code: string) => areaName(locale, code, SUBDOMAIN_NAMES[code] ?? code);
  const tc = useTranslations('common');
  const [answers, setAnswers] = useState<Answers>(initial);
  const firstOpen = useMemo(() => {
    const i = questions.findIndex((q) => (q.type === 'confidence' ? initial[q.id]?.confidence : initial[q.id]?.level) == null);
    return i === -1 ? questions.length - 1 : i;
  }, [questions, initial]);
  const [index, setIndex] = useState(firstOpen);
  const [saving, startSaving] = useTransition();
  const [finishing, startFinishing] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const q = questions[index];
  const value = q.type === 'confidence' ? answers[q.id]?.confidence : answers[q.id]?.level;
  const answered = questions.filter((x) => (x.type === 'confidence' ? answers[x.id]?.confidence : answers[x.id]?.level) != null).length;
  const isLast = index === questions.length - 1;

  function choose(v: number) {
    const answer = q.type === 'confidence' ? { confidence: v } : { level: v };
    setAnswers((a) => ({ ...a, [q.id]: answer }));
    setError(null);
    startSaving(async () => {
      try {
        await saveLnaAnswer({ attemptId, questionId: q.id, answer });
        if (!isLast) setIndex((i) => Math.min(i + 1, questions.length - 1));
      } catch {
        setError(t('saveFailed'));
      }
    });
  }

  function finish() {
    startFinishing(async () => {
      try {
        await completeLna(attemptId, locale);
        router.push('/growth/snapshot');
      } catch (e) {
        console.error(e);
        setError(tc('error'));
      }
    });
  }

  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="tend-dateline">{area(q.subdomain)}</span>
        <span aria-live="polite" className="tabular-nums">
          {index + 1} / {questions.length}
          {saving && <Loader2 aria-label={t('saving')} className="ml-2 inline size-3.5 animate-spin" />}
        </span>
      </div>
      {/* step dots, not a progress bar */}
      <ol aria-hidden className="flex flex-wrap gap-1">
        {questions.map((x, i) => {
          const done = (x.type === 'confidence' ? answers[x.id]?.confidence : answers[x.id]?.level) != null;
          return <li key={x.id} className={cn('size-1.5 rounded-full', i === index ? 'bg-primary' : done ? 'bg-primary/40' : 'bg-border')} />;
        })}
      </ol>

      <section className="tend-card grid gap-5 p-5 md:p-7" aria-labelledby="q-prompt">
        <h2 id="q-prompt" className="text-lg font-semibold leading-snug md:text-xl">{q.type === 'scenario' ? scenarioPrompt(locale, q.indicator, q.prompt) : t(q.type === 'self' ? 'selfPrompt' : 'confPrompt', { name: area(q.subdomain) })}</h2>

        {q.type === 'scenario' && (
          <div role="radiogroup" aria-labelledby="q-prompt" className="grid gap-2">
            {q.options.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={value === o.level}
                onClick={() => choose(o.level)}
                className={cn(
                  'flex min-h-14 items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors duration-150',
                  value === o.level ? 'border-primary bg-primary/5' : 'hover:border-primary/60 hover:bg-muted/50',
                )}
              >
                <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2', value === o.level ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                  {value === o.level && <Check className="size-3" aria-hidden />}
                </span>
                <span>{scenarioOption(locale, q.indicator, o.level, o.text)}</span>
              </button>
            ))}
          </div>
        )}

        {q.type === 'self' && (
          <div className="grid gap-3">
            <LevelStones level={value ?? null} onSelect={choose} />
            <p className="text-sm text-muted-foreground">{t('levelsHint')}</p>
          </div>
        )}

        {q.type === 'confidence' && (
          <div role="radiogroup" aria-labelledby="q-prompt" className="grid gap-2 sm:grid-cols-3">
            {CONFIDENCE.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={value === c.value}
                onClick={() => choose(c.value)}
                className={cn('min-h-14 rounded-xl border px-4 py-3 text-left font-medium', value === c.value ? 'border-primary bg-primary/5' : 'hover:border-primary/60')}
              >
                {t(`conf${c.value}`)}
              </button>
            ))}
          </div>
        )}
      </section>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" className="min-h-11" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
          <ArrowLeft aria-hidden /> {t('back')}
        </Button>
        {isLast || answered === questions.length ? (
          <Button className="min-h-11" disabled={answered < questions.length || finishing} onClick={finish}>
            {finishing ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />} {t('seeSnapshot')}
          </Button>
        ) : (
          <Button variant="outline" className="min-h-11" disabled={value == null} onClick={() => setIndex((i) => i + 1)}>
            {t('next')} <ArrowRight aria-hidden />
          </Button>
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground">{t('savesAsYouGo')}</p>
    </div>
  );
}
