import { describe, expect, it } from 'vitest';
import en from '../messages/en.json';
import { MAX_TOUR_STEPS, parseTourState, TOURS, tourAutoStep } from './tours';
import { NAV } from './nav';
import type { Area } from './auth/roles';

describe('role tours', () => {
  it('has at most 5 steps per role, each pointing at a nav item, with text', () => {
    for (const [area, steps] of Object.entries(TOURS) as [Area, (typeof TOURS)[Area]][]) {
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.length).toBeLessThanOrEqual(MAX_TOUR_STEPS);
      const hrefs = NAV[area].map((n) => n.href);
      for (const s of steps) {
        expect(hrefs, `${area}.${s.key}`).toContain(s.href);
        const msg = (en.tour as unknown as Record<string, Record<string, { title: string; body: string }>>)[area][s.key];
        expect(msg?.title && msg?.body, `${area}.${s.key}`).toBeTruthy();
      }
    }
  });

  it('parses stored state defensively', () => {
    expect(parseTourState(null)).toEqual({});
    expect(parseTourState([1])).toEqual({});
    expect(parseTourState({ educator: 2, leader: 'done', hq: 99, admin: 'nope', other: 1 })).toEqual({ educator: 2, leader: 'done' });
  });

  it('opens by itself only while in progress (new people), never for untouched or finished accounts', () => {
    expect(tourAutoStep({}, 'educator')).toBeNull();
    expect(tourAutoStep({ educator: 0 }, 'educator')).toBe(0);
    expect(tourAutoStep({ educator: 3 }, 'educator')).toBe(3);
    expect(tourAutoStep({ educator: 'done' }, 'educator')).toBeNull();
    expect(tourAutoStep({ educator: 'skipped' }, 'educator')).toBeNull();
    expect(tourAutoStep({ educator: 1 }, 'leader')).toBeNull();
  });
});
