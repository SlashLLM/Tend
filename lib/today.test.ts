import { describe, expect, it } from 'vitest';
import { buildTodayQueue, thisWeek, type QueueObs } from './today';

const now = new Date('2026-11-06T02:00:00Z');
const o = (id: string, status: string, scheduled: string, extra: Partial<QueueObs> = {}): QueueObs => ({
  id, status, scheduled_at: scheduled, title: null, educator_name: id, ...extra,
});

describe('buildTodayQueue', () => {
  const rows = [
    o('later-draft', 'ai_draft', '2026-11-05T02:00:00Z'),
    o('early-draft', 'in_review', '2026-11-04T02:00:00Z'),
    o('debrief', 'acknowledged', '2026-10-20T02:00:00Z', { shared_at: '2026-10-21T00:00:00Z' }),
    o('overdue', 'scheduled', '2026-11-05T01:00:00Z'),
    o('upcoming', 'scheduled', '2026-11-08T02:00:00Z'),
    o('done', 'discussed', '2026-10-01T02:00:00Z'),
    o('shared', 'shared', '2026-11-03T02:00:00Z'),
    o('processing', 'processing', '2026-11-06T01:00:00Z'),
  ];

  it('orders reviews (oldest first), then debriefs, then overdue', () => {
    expect(buildTodayQueue(rows, now).map((q) => `${q.kind}:${q.obs.id}`)).toEqual([
      'review:early-draft', 'review:later-draft', 'debrief:debrief', 'overdue:overdue',
    ]);
  });

  it('ignores finished, shared-awaiting-educator and processing observations', () => {
    const ids = buildTodayQueue(rows, now).map((q) => q.obs.id);
    for (const id of ['done', 'shared', 'processing', 'upcoming']) expect(ids).not.toContain(id);
  });

  it('a scheduled observation is not overdue within a 2-hour grace window', () => {
    const q = buildTodayQueue([o('just-now', 'scheduled', '2026-11-06T01:00:00Z')], now);
    expect(q).toEqual([]);
  });

  it('empty input → empty queue', () => expect(buildTodayQueue([], now)).toEqual([]));
});

describe('thisWeek', () => {
  it('lists scheduled observations in the next 7 days, soonest first', () => {
    const rows = [
      o('in-8-days', 'scheduled', '2026-11-14T03:00:00Z'),
      o('in-2-days', 'scheduled', '2026-11-08T02:00:00Z'),
      o('tomorrow', 'scheduled', '2026-11-07T02:00:00Z'),
      o('draft', 'ai_draft', '2026-11-07T02:00:00Z'),
    ];
    expect(thisWeek(rows, now).map((r) => r.id)).toEqual(['tomorrow', 'in-2-days']);
  });
});
