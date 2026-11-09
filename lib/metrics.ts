/** Sandbox Metrics presentation (PRD §3, M7.5). Every brief KPI with value, target and "how measured". */
export type RawMetrics = Record<string, { value: number | null; target?: number; n?: number; baseline?: number; reduction?: number } | number>;

export type Tile = { key: string; label: string; display: string; target: string; met: boolean | null; how: string };

const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);

export const KPI_DEFS: { key: string; label: string; how: string }[] = [
  { key: 'lna_agreement', label: 'Needs analysis reflects growth areas', how: 'One-tap survey after the needs analysis: “This reflects my growth areas” — share answering Yes.' },
  { key: 'transcription_accuracy', label: 'Transcription accuracy', how: '1 − word error rate, from the transcript corrections leaders make during review.' },
  { key: 'documentation_minutes', label: 'Documentation time', how: 'Median active review time from end of capture to approval, against a ~90-minute baseline.' },
  { key: 'tagging_accuracy', label: 'Tagging accuracy (AI)', how: 'Share of AI tags the leader accepts unchanged. After review every shared tag is leader-approved (100%).' },
  { key: 'interpretation_acceptance', label: 'Interpretation acceptance', how: 'Share of drafts approved with under 15% of the text changed.' },
  { key: 'strategy_application', label: 'Strategy application', how: 'Share of educators with shared feedback who logged “Tried it” on a coaching strategy.' },
  { key: 'adoption', label: 'Independent use', how: 'Share of educators who reflected, responded or logged a strategy in the last 21 days.' },
];

export function tiles(raw: RawMetrics): Tile[] {
  return KPI_DEFS.map((d) => {
    const m = raw[d.key] as { value: number | null; target?: number; reduction?: number; baseline?: number } | undefined;
    if (!m) return { ...d, display: '—', target: '', met: null };
    if (d.key === 'documentation_minutes') {
      const red = m.reduction ?? null;
      return { ...d, display: m.value == null ? '—' : `${m.value} min`, target: `≥ 70% less than ${m.baseline ?? 90} min (${pct(red)} less)`, met: red == null ? null : red >= (m.target ?? 0.7) };
    }
    return { ...d, display: pct(m.value), target: `target ≥ ${pct(m.target ?? null)}`, met: m.value == null ? null : m.value >= (m.target ?? 0) };
  });
}

/** CSV export (RFC 4180 quoting). */
export function toCsv(ts: Tile[], meta: { scope: string; generatedAt: string }): string {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [['metric', 'value', 'target', 'met', 'how_measured', 'scope', 'generated_at'].join(',')];
  for (const t of ts) lines.push([t.label, t.display, t.target, t.met == null ? '' : t.met ? 'yes' : 'no', t.how, meta.scope, meta.generatedAt].map(q).join(','));
  return `${lines.join('\n')}\n`;
}
