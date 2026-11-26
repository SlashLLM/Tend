import { CheckCircle2, CircleDashed, CircleDot, Info } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { tiles, type RawMetrics } from '@/lib/metrics';
import { cn } from '@/lib/utils';
import { PrintButton } from './print-button';

const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);

/** 7 KPI tiles (PRD M7.5) with value, target, status and "how measured"; CSV + PDF export. */
export async function MetricsBoard({ raw, csvHref }: { raw: RawMetrics; csvHref: string }) {
  const t = await getTranslations('metricsPage');
  const ts = tiles(raw);
  const hours = typeof raw.hours_saved_this_term === 'number' ? raw.hours_saved_this_term : 0;
  // Values come from lib/metrics; labels, targets and explanations are shown in the reader's language.
  const target = (key: string) => {
    const m = raw[key] as { value: number | null; target?: number; reduction?: number; baseline?: number } | undefined;
    if (!m) return '';
    return key === 'documentation_minutes' ? t('docTarget', { baseline: m.baseline ?? 90, pct: pct(m.reduction) }) : t('target', { pct: pct(m.target) });
  };
  const display = (key: string, d: string) => {
    const m = raw[key] as { value: number | null } | undefined;
    return key === 'documentation_minutes' && m?.value != null ? t('minutes', { n: m.value }) : d;
  };
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <a href={csvHref} className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium hover:border-primary">{t('exportCsv')}</a>
        <PrintButton label={t('exportPdf')} />
        <p className="text-sm text-muted-foreground">{t.rich('timeSaved', { n: hours, b: (c) => <span className="font-semibold text-foreground">{c}</span> })}</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ts.map((x) => (
          <li key={x.key} className="tend-card grid gap-2 p-5 break-inside-avoid">
            <p className="text-sm font-medium text-muted-foreground">{t.has(`kpi.${x.key}.label`) ? t(`kpi.${x.key}.label`) : x.label}</p>
            <p className="font-heading text-4xl font-semibold tabular-nums">{display(x.key, x.display)}</p>
            <p className={cn('flex items-center gap-1.5 text-sm', x.met === true ? 'text-success' : x.met === false ? 'text-amber' : 'text-muted-foreground')}>
              {x.met === true ? <CheckCircle2 className="size-4" aria-hidden /> : x.met === false ? <CircleDot className="size-4" aria-hidden /> : <CircleDashed className="size-4" aria-hidden />}
              {target(x.key)}{x.met === true ? t('onTrack') : x.met === false ? t('notYet') : t('noData')}
            </p>
            <details className="text-xs text-muted-foreground">
              <summary className="flex min-h-9 cursor-pointer items-center gap-1"><Info className="size-3.5" aria-hidden /> {t('howMeasured')}</summary>
              <p className="pt-1">{t.has(`kpi.${x.key}.how`) ? t(`kpi.${x.key}.how`) : x.how}</p>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
