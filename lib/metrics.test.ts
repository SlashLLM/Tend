import { describe, expect, it } from 'vitest';
import { KPI_DEFS, tiles, toCsv } from './metrics';

const raw = {
  lna_agreement: { value: 0.88, target: 0.85, n: 20 },
  transcription_accuracy: { value: 0.955, target: 0.95 },
  documentation_minutes: { value: 4.1, baseline: 90, reduction: 0.954, target: 0.7, n: 100 },
  tagging_accuracy: { value: 0.66, target: 0.7, n: 500 },
  interpretation_acceptance: { value: null, target: 0.7 },
  strategy_application: { value: 0.75, target: 0.7 },
  adoption: { value: 0.9, target: 0.8 },
  hours_saved_this_term: 120,
};

describe('Sandbox metrics', () => {
  const t = tiles(raw);
  it('has exactly the 7 brief KPIs, each with a "how measured"', () => {
    expect(t).toHaveLength(7);
    expect(KPI_DEFS).toHaveLength(7);
    for (const x of t) expect(x.how.length).toBeGreaterThan(20);
  });
  it('formats values and marks targets honestly (met / not met / no data)', () => {
    const by = Object.fromEntries(t.map((x) => [x.key, x]));
    expect(by.lna_agreement).toMatchObject({ display: '88%', met: true });
    expect(by.tagging_accuracy).toMatchObject({ display: '66%', met: false });
    expect(by.interpretation_acceptance).toMatchObject({ display: '—', met: null });
    expect(by.documentation_minutes.display).toBe('4.1 min');
    expect(by.documentation_minutes.target).toContain('95% less');
    expect(by.documentation_minutes.met).toBe(true);
  });
  it('CSV escapes commas and quotes', () => {
    const csv = toCsv(t, { scope: 'Punggol, SG', generatedAt: '2026-11-06' });
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(8);
    expect(lines[0]).toBe('metric,value,target,met,how_measured,scope,generated_at');
    expect(csv).toContain('"Punggol, SG"');
    expect(csv).toContain('“This reflects my growth areas”');
  });
});
