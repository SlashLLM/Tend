'use client';
import { useFormatter, useTranslations } from 'next-intl';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Props = { points: { at: string; level: number }[]; selfRating?: number | null; target?: number | null };

/** Step chart of observed level over time (PRD M3.4). Levels only — never a percentage or score. */
export function TrajectoryChart({ points, selfRating, target }: Props) {
  const t = useTranslations('chart');
  const format = useFormatter();
  if (points.length === 0) return <p className="text-sm text-muted-foreground">{t('empty')}</p>;
  const data = points.map((p) => ({ t: new Date(p.at).getTime(), level: p.level, self: selfRating ?? undefined }));
  const fmt = (ms: number) => format.dateTime(new Date(ms), { day: 'numeric', month: 'short' });
  return (
    <figure className="grid gap-2">
      <div className="h-48 w-full" role="img" aria-label={t('aria', { list: points.map((p) => t('point', { level: p.level, date: fmt(new Date(p.at).getTime()) })).join(', ') })}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={fmt} stroke="var(--muted-foreground)" fontSize={12} />
            <YAxis domain={[0.5, 3.5]} ticks={[1, 2, 3]} tickFormatter={(v) => `L${v}`} stroke="var(--muted-foreground)" fontSize={12} />
            <Tooltip labelFormatter={(v) => fmt(Number(v))} formatter={(v, name) => [t('level', { level: Number(v) }), name]} />
            <Line name={t('seenAt')} type="stepAfter" dataKey="level" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 4, fill: 'var(--primary)' }} isAnimationActive={false} />
            {selfRating != null && <Line name={t('selfRating')} dataKey="self" stroke="var(--amber)" strokeDasharray="4 4" dot={false} isAnimationActive={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-primary" /> {t('seenAtLegend')}</span>
        {selfRating != null && <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-amber" /> {t('selfRating')}</span>}
        {target != null && <span>{t('aim', { level: target })}</span>}
      </figcaption>
    </figure>
  );
}
