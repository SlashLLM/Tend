'use client';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';

type Props = { points: { at: string; level: number }[]; selfRating?: number | null; target?: number | null };

/** Step chart of observed level over time (PRD M3.4). Levels only — never a percentage or score. */
export function TrajectoryChart({ points, selfRating, target }: Props) {
  if (points.length === 0) return <p className="text-sm text-muted-foreground">No observations on this goal yet.</p>;
  const data = points.map((p) => ({ t: new Date(p.at).getTime(), level: p.level, self: selfRating ?? undefined }));
  const fmt = (t: number) => new Date(t).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
  return (
    <figure className="grid gap-2">
      <div className="h-48 w-full" role="img" aria-label={`Observed levels over time: ${points.map((p) => `Level ${p.level} on ${fmt(new Date(p.at).getTime())}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={fmt} stroke="var(--muted-foreground)" fontSize={12} />
            <YAxis domain={[0.5, 3.5]} ticks={[1, 2, 3]} tickFormatter={(v) => `L${v}`} stroke="var(--muted-foreground)" fontSize={12} />
            <Tooltip labelFormatter={(v) => fmt(Number(v))} formatter={(v) => [`Level ${v}`, 'Seen at']} />
            <Line type="stepAfter" dataKey="level" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 4, fill: 'var(--primary)' }} isAnimationActive={false} />
            {selfRating != null && <Line dataKey="self" stroke="var(--amber)" strokeDasharray="4 4" dot={false} isAnimationActive={false} />}
            <Scatter dataKey="level" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-primary" /> Seen at (observations)</span>
        {selfRating != null && <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-amber" /> Your self-rating</span>}
        {target != null && <span>Aim: Level {target}</span>}
      </figcaption>
    </figure>
  );
}
