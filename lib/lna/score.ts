/**
 * LNA scoring → Growth Snapshot (PRD M2.4). Deterministic and explainable.
 * Internal numbers never leave this module: the snapshot carries only
 * subdomains, indicator codes and whole levels (1–3), never a score.
 */
import { SUBDOMAIN_TO_TSC } from '../../supabase/seed/registry';
import type { Question } from './content';

export type Answers = Record<string, { level?: number; confidence?: number }>;

export type SnapshotArea = { subdomain: string; level: 1 | 2 | 3; skill: string };
export type SuggestedGoal = { indicator: string; subdomain: string; current_level: 1 | 2 | 3; target_level: 1 | 2 | 3; reason: string };
export type Snapshot = { strengths: SnapshotArea[]; growth_areas: SnapshotArea[]; suggested_goals: SuggestedGoal[] };

const clamp = (n: number): 1 | 2 | 3 => (Math.max(1, Math.min(3, Math.round(n))) as 1 | 2 | 3);

export function answeredCount(questions: Question[], answers: Answers) {
  return questions.filter((q) => (q.type === 'confidence' ? answers[q.id]?.confidence : answers[q.id]?.level) != null).length;
}

export function isComplete(questions: Question[], answers: Answers) {
  return answeredCount(questions, answers) === questions.length;
}

export function scoreLna(questions: Question[], answers: Answers): Snapshot {
  const subs = [...new Set(questions.map((q) => q.subdomain))];
  const rows = subs.map((sd) => {
    const scen = questions.filter((q) => q.type === 'scenario' && q.subdomain === sd);
    const scenLevels = scen.map((q) => answers[q.id]?.level).filter((x): x is number => x != null);
    const self = answers[`self-${sd}`]?.level;
    const conf = answers[`conf-${sd}`]?.confidence ?? 2;
    const scenAvg = scenLevels.length ? scenLevels.reduce((a, b) => a + b, 0) / scenLevels.length : self ?? 2;
    // Scenarios (what you would do) weigh more than self-view.
    const combined = self != null ? 0.6 * scenAvg + 0.4 * self : scenAvg;
    // Lowest-level scenario in the subdomain becomes the goal indicator.
    const weakest = scen
      .map((q) => ({ q, l: answers[q.id]?.level ?? 3 }))
      .sort((a, b) => a.l - b.l || (a.q.type === 'scenario' && b.q.type === 'scenario' ? a.q.indicator.localeCompare(b.q.indicator) : 0))[0];
    return { sd, combined, conf, weakest };
  });

  const byHigh = [...rows].sort((a, b) => b.combined - a.combined || b.conf - a.conf || a.sd.localeCompare(b.sd));
  // Growth: lowest combined first; lower confidence breaks ties.
  const byLow = [...rows].sort((a, b) => a.combined - b.combined || a.conf - b.conf || a.sd.localeCompare(b.sd));

  const growthRows = byLow.slice(0, 3);
  const growthSet = new Set(growthRows.map((r) => r.sd));
  const strengthRows = byHigh.filter((r) => !growthSet.has(r.sd)).slice(0, 3);

  const area = (r: (typeof rows)[number]): SnapshotArea => ({ subdomain: r.sd, level: clamp(r.combined), skill: SUBDOMAIN_TO_TSC[r.sd] ?? 'EC-TSC-INF' });

  const suggested_goals: SuggestedGoal[] = growthRows.map((r) => {
    const current = clamp(r.weakest && r.weakest.q.type === 'scenario' ? Math.min(r.combined, answers[r.weakest.q.id]?.level ?? r.combined) : r.combined);
    // Infant/toddler practices (IT.n) are themselves the goal; QTT subdomains fall back to their first indicator.
    const indicator = r.weakest && r.weakest.q.type === 'scenario' ? r.weakest.q.indicator : r.sd.startsWith('IT') ? r.sd : `${r.sd}.1`;
    return {
      indicator,
      subdomain: r.sd,
      current_level: current,
      target_level: clamp(Math.min(3, current + 1)),
      reason: r.conf <= 1 ? 'You said you are still finding your feet here.' : 'Your answers suggest this is a good next area to grow.',
    };
  });

  return { strengths: strengthRows.map(area), growth_areas: growthRows.map(area), suggested_goals };
}
