'use client';
import { Check, Loader2, RotateCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STEPS = ['transcribe', 'redact', 'segment', 'retrieve', 'tag', 'contextualise', 'draft', 'tone', 'cards', 'save'] as const;

/** Shown while the AI pipeline runs (target: draft within 60 s of End). */
export function PipelineProgress({ obsId, initialStep }: { obsId: string; initialStep: string | null }) {
  const router = useRouter();
  const t = useTranslations('pipeline');
  const [step, setStep] = useState(initialStep ?? 'queued');
  const [started] = useState(Date.now());
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const id = setInterval(async () => {
      setSecs(Math.round((Date.now() - started) / 1000));
      const res = await fetch(`/api/observations/${obsId}/status`, { cache: 'no-store' });
      if (!res.ok) return;
      const s = (await res.json()) as { status: string; pipeline_step: string | null };
      setStep(s.pipeline_step ?? 'queued');
      if (s.status !== 'processing') router.refresh();
    }, 1200);
    return () => clearInterval(id);
  }, [obsId, router, started]);

  const failed = step.startsWith('error');
  const idx = STEPS.findIndex((k) => k === step);
  return (
    <section className="tend-card mx-auto grid max-w-md gap-4 p-6" aria-live="polite">
      <h2 className="text-lg font-semibold">{failed ? t('failed') : t('drafting')}</h2>
      <ol className="grid gap-2">
        {STEPS.map((k, i) => (
          <li key={k} className={cn('flex items-center gap-2 text-sm', i > idx && 'text-muted-foreground')}>
            {i < idx ? <Check className="size-4 text-success" aria-hidden /> : i === idx && !failed ? <Loader2 className="size-4 animate-spin text-primary" aria-hidden /> : <span className="size-4" />}
            {t(k)}
          </li>
        ))}
      </ol>
      {failed ? (
        <Button className="min-h-11" onClick={async () => { await fetch(`/api/observations/${obsId}/end`, { method: 'POST' }); setStep('queued'); }}>
          <RotateCw aria-hidden /> {t('retry')}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground tabular-nums">{t('elapsed', { secs })}</p>
      )}
    </section>
  );
}
