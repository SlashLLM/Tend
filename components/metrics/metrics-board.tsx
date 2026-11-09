import { CheckCircle2, CircleDashed, CircleDot, Info } from 'lucide-react';
import { tiles, type RawMetrics } from '@/lib/metrics';
import { cn } from '@/lib/utils';
import { PrintButton } from './print-button';

/** 7 KPI tiles (PRD M7.5) with value, target, status and "how measured"; CSV + PDF export. */
export function MetricsBoard({ raw, csvHref }: { raw: RawMetrics; csvHref: string }) {
  const ts = tiles(raw);
  const hours = typeof raw.hours_saved_this_term === 'number' ? raw.hours_saved_this_term : 0;
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <a href={csvHref} className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium hover:border-primary">Export CSV</a>
        <PrintButton />
        <p className="text-sm text-muted-foreground">Time saved this term: <span className="font-semibold text-foreground">{hours} hours</span></p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ts.map((t) => (
          <li key={t.key} className="tend-card grid gap-2 p-5 break-inside-avoid">
            <p className="text-sm font-medium text-muted-foreground">{t.label}</p>
            <p className="font-heading text-4xl font-semibold tabular-nums">{t.display}</p>
            <p className={cn('flex items-center gap-1.5 text-sm', t.met === true ? 'text-success' : t.met === false ? 'text-amber' : 'text-muted-foreground')}>
              {t.met === true ? <CheckCircle2 className="size-4" aria-hidden /> : t.met === false ? <CircleDot className="size-4" aria-hidden /> : <CircleDashed className="size-4" aria-hidden />}
              {t.target}{t.met === true ? ' · on track' : t.met === false ? ' · not yet' : ' · no data yet'}
            </p>
            <details className="text-xs text-muted-foreground">
              <summary className="flex min-h-9 cursor-pointer items-center gap-1"><Info className="size-3.5" aria-hidden /> How measured</summary>
              <p className="pt-1">{t.how}</p>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
