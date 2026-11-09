import { describe, expect, it } from 'vitest';
import { collapseByObservation, latestMove } from './trajectory';

const d = (week: number) => new Date(Date.UTC(2026, 0, 1) + week * 7 * 86_400_000).toISOString();

describe('trajectory', () => {
  it('keeps the highest level per observation and sorts by date', () => {
    const pts = collapseByObservation([
      { observationId: 'b', at: d(2), level: 1 },
      { observationId: 'a', at: d(0), level: 1 },
      { observationId: 'b', at: d(2), level: 2 },
    ]);
    expect(pts).toEqual([{ at: d(0), level: 1 }, { at: d(2), level: 2 }]);
  });

  it('describes "Level 1 → Level 2 in 7 weeks"', () => {
    expect(latestMove([{ at: d(0), level: 1 }, { at: d(3), level: 1 }, { at: d(7), level: 2 }])).toEqual({ from: 1, to: 2, weeks: 7 });
  });

  it('measures from the start of the previous run to the first point of the new run', () => {
    expect(latestMove([{ at: d(0), level: 1 }, { at: d(5), level: 2 }, { at: d(9), level: 2 }])).toEqual({ from: 1, to: 2, weeks: 5 });
  });

  it('null when there is no move or not enough points', () => {
    expect(latestMove([])).toBeNull();
    expect(latestMove([{ at: d(0), level: 2 }])).toBeNull();
    expect(latestMove([{ at: d(0), level: 2 }, { at: d(4), level: 2 }])).toBeNull();
  });

  it('reports a move down honestly (no spin), at least 1 week', () => {
    expect(latestMove([{ at: d(0), level: 2 }, { at: d(0), level: 1 }])).toEqual({ from: 2, to: 1, weeks: 1 });
  });
});
