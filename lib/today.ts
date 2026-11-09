/** Leader "Needs you" queue (PRD M7.1). Pure, so it is unit-tested. */
export type QueueObs = {
  id: string;
  status: string;
  scheduled_at: string;
  title: string | null;
  educator_name: string;
  shared_at?: string | null;
};

export type QueueItem =
  | { kind: 'review'; obs: QueueObs }
  | { kind: 'debrief'; obs: QueueObs }
  | { kind: 'overdue'; obs: QueueObs };

const DAY = 86_400_000;

/**
 * Order: drafts to review first (oldest first — feedback should go out the same day),
 * then debriefs due, then observations scheduled in the past that never started.
 */
export function buildTodayQueue(rows: QueueObs[], now: Date): QueueItem[] {
  const t = now.getTime();
  const reviews = rows
    .filter((o) => o.status === 'ai_draft' || o.status === 'in_review')
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    .map((obs) => ({ kind: 'review' as const, obs }));
  const debriefs = rows
    .filter((o) => o.status === 'acknowledged')
    .sort((a, b) => (a.shared_at ?? a.scheduled_at).localeCompare(b.shared_at ?? b.scheduled_at))
    .map((obs) => ({ kind: 'debrief' as const, obs }));
  const overdue = rows
    .filter((o) => o.status === 'scheduled' && new Date(o.scheduled_at).getTime() < t - 2 * 60 * 60 * 1000)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    .map((obs) => ({ kind: 'overdue' as const, obs }));
  return [...reviews, ...debriefs, ...overdue];
}

export function thisWeek(rows: QueueObs[], now: Date): QueueObs[] {
  const t = now.getTime();
  return rows
    .filter((o) => o.status === 'scheduled')
    .filter((o) => {
      const s = new Date(o.scheduled_at).getTime();
      return s >= t - 2 * 60 * 60 * 1000 && s <= t + 7 * DAY;
    })
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
}
