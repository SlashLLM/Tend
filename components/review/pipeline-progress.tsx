'use client';
import { Check, Loader2, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const LABELS: [string, string][] = [
  ['transcribe', 'Transcribing'], ['redact', 'Removing child names'], ['segment', 'Finding moments'], ['retrieve', 'Matching to QTT'],
  ['tag', 'Tagging indicators'], ['contextualise', 'Reading the plan and focus'], ['draft', 'Drafting cited feedback'], ['tone', 'Checking tone'],
  ['cards', 'Choosing coaching cards'], ['save', 'Saving the draft'],
];

/** Shown while the AI pipeline runs (target: draft within 60 s of End). */
export function PipelineProgress({ obsId, initialStep }: { obsId: string; initialStep: string | null }) {
  const router = useRouter();
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
  const idx = LABELS.findIndex(([k]) => k === step);
  return (
    <section className="tend-card mx-auto grid max-w-md gap-4 p-6" aria-live="polite">
      <h2 className="text-lg font-semibold">{failed ? 'Drafting hit a problem' : 'Drafting growth notes…'}</h2>
      <ol className="grid gap-2">
        {LABELS.map(([k, label], i) => (
          <li key={k} className={cn('flex items-center gap-2 text-sm', i > idx && 'text-muted-foreground')}>
            {i < idx ? <Check className="size-4 text-success" aria-hidden /> : i === idx && !failed ? <Loader2 className="size-4 animate-spin text-primary" aria-hidden /> : <span className="size-4" />}
            {label}
          </li>
        ))}
      </ol>
      {failed ? (
        <Button className="min-h-11" onClick={async () => { await fetch(`/api/observations/${obsId}/end`, { method: 'POST' }); setStep('queued'); }}>
          <RotateCw aria-hidden /> Try again
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground tabular-nums">{secs}s · you’ll be notified when it’s ready</p>
      )}
    </section>
  );
}
