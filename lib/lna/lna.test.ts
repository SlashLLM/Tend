import { describe, expect, it } from 'vitest';
import { flatIndicators } from '@/supabase/seed/registry';
import { preschoolQuestions, type Question } from './content';
import { answeredCount, isComplete, scoreLna, type Answers } from './score';

const qs = preschoolQuestions();
const codes = new Set(flatIndicators().map((i) => i.code));

/** Answer every question at a fixed level, with per-subdomain overrides. */
function answerAll(level: number, overrides: Record<string, number> = {}, conf = 2): Answers {
  const a: Answers = {};
  for (const q of qs) {
    const l = overrides[q.subdomain] ?? level;
    if (q.type === 'confidence') a[q.id] = { confidence: conf };
    else a[q.id] = { level: l };
  }
  return a;
}

describe('LNA content', () => {
  it('covers all 8 subdomains with 2 scenarios + self-rating + confidence each (32 items)', () => {
    expect(qs).toHaveLength(32);
    const subs = [...new Set(qs.map((q) => q.subdomain))];
    expect(subs).toHaveLength(8);
    for (const sd of subs) {
      const of = (t: Question['type']) => qs.filter((q) => q.subdomain === sd && q.type === t).length;
      expect([of('scenario'), of('self'), of('confidence')], sd).toEqual([2, 1, 1]);
    }
  });

  it('every scenario targets a real QTT indicator in its own subdomain and offers exactly levels 1, 2, 3', () => {
    for (const q of qs.filter((x) => x.type === 'scenario')) {
      if (q.type !== 'scenario') continue;
      expect(codes.has(q.indicator), q.indicator).toBe(true);
      expect(q.indicator.startsWith(`${q.subdomain}.`)).toBe(true);
      expect(q.options.map((o) => o.level).sort()).toEqual([1, 2, 3]);
      expect(new Set(q.options.map((o) => o.id)).size).toBe(3);
    }
  });

  it('the level-3 answer is not always in the same position (no pattern to game)', () => {
    const positions = qs.flatMap((q) => (q.type === 'scenario' ? [q.options.findIndex((o) => o.level === 3)] : []));
    expect(new Set(positions).size).toBeGreaterThan(1);
  });

  it('question ids are unique and stable', () => {
    expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
    expect(preschoolQuestions().map((q) => q.id)).toEqual(qs.map((q) => q.id));
  });
});

describe('scoreLna', () => {
  it('picks the 3 weakest subdomains as growth areas and suggests a goal per area', () => {
    const s = scoreLna(qs, answerAll(3, { '3.3': 1, '3.4': 1, '2.2': 2 }));
    expect(s.growth_areas.map((g) => g.subdomain).sort()).toEqual(['2.2', '3.3', '3.4']);
    expect(s.suggested_goals).toHaveLength(3);
    for (const g of s.suggested_goals) {
      expect(codes.has(g.indicator)).toBe(true);
      expect(g.indicator.startsWith(`${g.subdomain}.`)).toBe(true);
      expect(g.target_level).toBeGreaterThanOrEqual(g.current_level);
    }
    const g33 = s.suggested_goals.find((g) => g.subdomain === '3.3')!;
    expect(g33).toMatchObject({ current_level: 1, target_level: 2 });
  });

  it('strengths never overlap growth areas', () => {
    const s = scoreLna(qs, answerAll(2, { '1.1': 3, '2.1': 3 }));
    const growth = new Set(s.growth_areas.map((g) => g.subdomain));
    for (const st of s.strengths) expect(growth.has(st.subdomain)).toBe(false);
    expect(s.strengths.map((x) => x.subdomain)).toEqual(expect.arrayContaining(['1.1', '2.1']));
  });

  it('the goal indicator is the scenario the educator answered lowest', () => {
    const a = answerAll(3);
    a['sc-3.3.4'] = { level: 1 }; // questioning
    a['sc-3.3.6'] = { level: 2 };
    a['self-3.3'] = { level: 1 };
    const s = scoreLna(qs, a);
    expect(s.suggested_goals.find((g) => g.subdomain === '3.3')?.indicator).toBe('3.3.4');
  });

  it('low confidence breaks ties toward growth and gives a reason', () => {
    const a = answerAll(2);
    a['conf-3.4'] = { confidence: 1 };
    const s = scoreLna(qs, a);
    expect(s.growth_areas[0].subdomain).toBe('3.4');
    expect(s.suggested_goals[0].reason).toMatch(/finding your feet/);
  });

  it('a level-3 practitioner still gets goals (target stays at 3 — "keep growing it")', () => {
    const s = scoreLna(qs, answerAll(3));
    expect(s.suggested_goals).toHaveLength(3);
    for (const g of s.suggested_goals) expect(g).toMatchObject({ current_level: 3, target_level: 3 });
  });

  it('carries only whole levels — no decimals, totals or scores leak out', () => {
    const s = scoreLna(qs, answerAll(2, { '3.3': 1 }));
    const json = JSON.stringify(s);
    expect(json).not.toMatch(/\d\.\d{2,}/); // no averages like 1.6667
    expect(json).not.toMatch(/score|total|average|rank/i);
    for (const x of [...s.strengths, ...s.growth_areas]) expect([1, 2, 3]).toContain(x.level);
  });

  it('is deterministic', () => {
    const a = answerAll(2, { '3.4': 1 });
    expect(scoreLna(qs, a)).toEqual(scoreLna(qs, a));
  });

  it('completion tracking', () => {
    expect(answeredCount(qs, {})).toBe(0);
    expect(isComplete(qs, answerAll(2))).toBe(true);
    const partial = answerAll(2);
    delete partial['conf-1.1'];
    expect(answeredCount(qs, partial)).toBe(31);
    expect(isComplete(qs, partial)).toBe(false);
  });
});
