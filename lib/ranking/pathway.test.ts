import { describe, expect, it } from 'vitest';
import { costEffectiveness, levelFit, rankPathway, relevance, timeliness, WEIGHTS, type Candidate, type Goal } from './pathway';

const now = new Date('2026-11-06T00:00:00Z');
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString().slice(0, 10);
const goal: Goal = { indicator: '3.3.4', subdomain: '3.3', tsc: 'EC-TSC-LAN', current_level: 1, target_level: 2 };
const c = (over: Partial<Candidate>): Candidate => ({
  id: over.title ?? 'x', tier: 'course', title: 'x', indicator_codes: [], tsc_codes: [], subdomain_codes: [], level_min: 1, level_max: 3, funded: true, next_run: null, ...over,
});

describe('pathway formula (PRD §8)', () => {
  it('weights sum to 1', () => expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1));

  it('relevance: 1.0 same indicator, 0.7 same skill, 0.4 same subdomain, 0 otherwise', () => {
    expect(relevance(c({ indicator_codes: ['3.3.4'] }), goal)).toBe(1);
    expect(relevance(c({ tsc_codes: ['EC-TSC-LAN'] }), goal)).toBe(0.7);
    expect(relevance(c({ subdomain_codes: ['3.3'] }), goal)).toBe(0.4);
    expect(relevance(c({ subdomain_codes: ['1.1'] }), goal)).toBe(0);
  });

  it('cost: peer 1.0 · internal 0.9 · micro 0.85 · funded 0.6 · unfunded 0.4', () => {
    expect([c({ tier: 'peer' }), c({ tier: 'internal' }), c({ tier: 'micro' }), c({ funded: true }), c({ funded: false })].map(costEffectiveness)).toEqual([1, 0.9, 0.85, 0.6, 0.4]);
  });

  it('timeliness: 1.0 within 30 days, linear to 0.2 at 180, 0.2 beyond', () => {
    expect(timeliness(c({ next_run: inDays(10) }), now)).toBe(1);
    expect(timeliness(c({ next_run: inDays(30) }), now)).toBe(1);
    expect(timeliness(c({ next_run: inDays(105) }), now)).toBeCloseTo(0.6);
    expect(timeliness(c({ next_run: inDays(180) }), now)).toBeCloseTo(0.2);
    expect(timeliness(c({ next_run: inDays(400) }), now)).toBe(0.2);
    expect(timeliness(c({ next_run: null }), now)).toBe(1);
  });

  it('level fit: 1 inside range, lower outside', () => {
    expect(levelFit(c({ level_min: 1, level_max: 2 }), goal)).toBe(1);
    expect(levelFit(c({ level_min: 3, level_max: 3 }), goal)).toBe(0.5);
  });
});

describe('rankPathway', () => {
  const cands: Candidate[] = [
    c({ title: 'Peer: watch Farah', tier: 'peer', indicator_codes: ['3.3.4'], next_run: null }),
    c({ title: 'NIEC questioning', tier: 'course', indicator_codes: ['3.3.4'], next_run: inDays(14), funded: true }),
    c({ title: 'Micro: wait time', tier: 'micro', indicator_codes: ['3.3.4'] }),
    c({ title: 'Language-rich classrooms', tier: 'course', subdomain_codes: ['3.3'], next_run: inDays(200), funded: false }),
    c({ title: 'Irrelevant', tier: 'internal', subdomain_codes: ['1.1'] }),
    c({ title: 'Skill match', tier: 'internal', tsc_codes: ['EC-TSC-LAN'] }),
    c({ title: 'Another', tier: 'micro', subdomain_codes: ['3.3'] }),
  ];
  const ranked = rankPathway(cands, goal, now);

  it('returns at most 5, never irrelevant options, best first', () => {
    expect(ranked.length).toBeLessThanOrEqual(5);
    expect(ranked.map((r) => r.title)).not.toContain('Irrelevant');
    expect(ranked[0].title).toBe('Peer: watch Farah');
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
  });

  it('scores are exactly the formula', () => {
    const peer = ranked.find((r) => r.title === 'Peer: watch Farah')!;
    expect(peer.score).toBeCloseTo(0.4 * 1 + 0.2 * 1 + 0.15 * 0.5 + 0.15 * 1 + 0.1 * 1);
  });

  it('every recommendation explains itself with its top 2 reasons', () => {
    for (const r of ranked) {
      expect(r.reasons.length).toBeGreaterThan(0);
      expect(r.reasons.length).toBeLessThanOrEqual(2);
    }
    expect(ranked.find((r) => r.title === 'NIEC questioning')!.reasons).toEqual(['Matches your goal 3.3.4', 'Starts in 2 weeks']);
    expect(ranked[0].reasons).toContain('Matches your goal 3.3.4');
  });

  it('is deterministic', () => expect(rankPathway(cands, goal, now)).toEqual(ranked));
});
