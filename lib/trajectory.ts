/** Level trajectory helpers (PRD M3.4): "Level 1 → Level 2 in 7 weeks". Pure + tested. */
export type Point = { at: string; level: number };

/** One point per observation (highest accepted level that day), oldest first. */
export function collapseByObservation(points: (Point & { observationId: string })[]): Point[] {
  const best = new Map<string, Point>();
  for (const p of points) {
    const cur = best.get(p.observationId);
    if (!cur || p.level > cur.level) best.set(p.observationId, { at: p.at, level: p.level });
  }
  return [...best.values()].sort((a, b) => a.at.localeCompare(b.at));
}

/** Describe the most recent level change, e.g. { from: 1, to: 2, weeks: 7 }. Null if never moved. */
export function latestMove(points: Point[]): { from: number; to: number; weeks: number } | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  // find the first point of the run at the previous level
  let i = points.length - 1;
  while (i > 0 && points[i - 1].level === last.level) i--;
  if (i === 0) return null;
  const prevLevel = points[i - 1].level;
  let j = i - 1;
  while (j > 0 && points[j - 1].level === prevLevel) j--;
  const weeks = Math.max(1, Math.round((new Date(points[i].at).getTime() - new Date(points[j].at).getTime()) / (7 * 86_400_000)));
  return { from: prevLevel, to: last.level, weeks };
}
