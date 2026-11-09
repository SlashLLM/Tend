/**
 * Pathway ranking (PRD §8) — a fixed, explainable formula, not AI:
 *   score = 0.40·relevance + 0.20·levelFit + 0.15·preference + 0.15·cost + 0.10·timeliness
 */
export type Tier = 'peer' | 'internal' | 'micro' | 'course';

export type Candidate = {
  id: string;
  tier: Tier;
  title: string;
  indicator_codes: string[];
  tsc_codes: string[];
  subdomain_codes: string[];
  level_min: number;
  level_max: number;
  funded: boolean;
  next_run: string | null; // ISO date; null = always available
  preferred_mode?: boolean;
};

export type Goal = { indicator: string; subdomain: string; tsc: string | null; current_level: number; target_level: number };

export const WEIGHTS = { relevance: 0.4, levelFit: 0.2, preference: 0.15, cost: 0.15, timeliness: 0.1 } as const;

export function relevance(c: Candidate, g: Goal) {
  if (c.indicator_codes.includes(g.indicator)) return 1;
  if (g.tsc && c.tsc_codes.includes(g.tsc)) return 0.7;
  if (c.subdomain_codes.includes(g.subdomain)) return 0.4;
  return 0;
}

export function levelFit(c: Candidate, g: Goal) {
  const want = g.target_level;
  if (want >= c.level_min && want <= c.level_max) return 1;
  const gap = want < c.level_min ? c.level_min - want : want - c.level_max;
  return Math.max(0, 1 - 0.5 * gap);
}

export function costEffectiveness(c: Candidate) {
  if (c.tier === 'peer') return 1;
  if (c.tier === 'internal') return 0.9;
  if (c.tier === 'micro') return 0.85;
  return c.funded ? 0.6 : 0.4;
}

/** 1.0 within 30 days, falling linearly to 0.2 at 180 days (and beyond). */
export function timeliness(c: Candidate, now: Date) {
  if (!c.next_run) return 1;
  const days = (new Date(c.next_run).getTime() - now.getTime()) / 86_400_000;
  if (days < 0) return 0.2; // already started / past run
  if (days <= 30) return 1;
  if (days >= 180) return 0.2;
  return 1 - (0.8 * (days - 30)) / 150;
}

export type Ranked = Candidate & { score: number; reasons: string[] };

export function rankPathway(cands: Candidate[], goal: Goal, now: Date, limit = 5): Ranked[] {
  return cands
    .map((c) => {
      const parts = {
        relevance: relevance(c, goal),
        levelFit: levelFit(c, goal),
        preference: c.preferred_mode ? 1 : 0.5,
        cost: costEffectiveness(c),
        timeliness: timeliness(c, now),
      };
      const score =
        WEIGHTS.relevance * parts.relevance + WEIGHTS.levelFit * parts.levelFit + WEIGHTS.preference * parts.preference + WEIGHTS.cost * parts.cost + WEIGHTS.timeliness * parts.timeliness;
      return { ...c, score: Math.round(score * 1000) / 1000, reasons: reasonsFor(c, goal, parts, now) };
    })
    .filter((c) => relevance(c, goal) > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}

function reasonsFor(c: Candidate, g: Goal, p: Record<string, number>, now: Date): string[] {
  const r: [number, string][] = [];
  if (p.relevance === 1) r.push([0.4, `Matches your goal ${g.indicator}`]);
  else if (p.relevance === 0.7) r.push([0.28, 'Builds the same skill as your goal']);
  else if (p.relevance > 0) r.push([0.16, 'Same area as your goal']);
  if (c.tier === 'peer') r.push([0.15, 'Free — learn from a colleague']);
  else if (c.tier !== 'course') r.push([0.13, 'Free and in-house']);
  else if (c.funded) r.push([0.09, 'Funding available']);
  if (c.next_run) {
    const days = Math.round((new Date(c.next_run).getTime() - now.getTime()) / 86_400_000);
    if (days >= 0 && days <= 30) r.push([0.1, days <= 7 ? 'Starts this week' : `Starts in ${Math.round(days / 7)} week${Math.round(days / 7) === 1 ? '' : 's'}`]);
  } else if (c.tier === 'micro') r.push([0.1, 'Available any time']);
  if (p.levelFit === 1) r.push([0.08, `Pitched at Level ${g.target_level}`]);
  return r.sort((a, b) => b[0] - a[0]).slice(0, 2).map(([, s]) => s);
}
