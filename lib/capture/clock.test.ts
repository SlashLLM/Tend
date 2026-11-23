import { describe, expect, it } from 'vitest';
import { deviceStart, elapsedSince } from './clock';

describe('capture clock', () => {
  it('offsets do not depend on how far the device clock is off', () => {
    for (const deviceNow of [Date.parse('2026-11-23T09:28:30Z') /* 90 s behind */, Date.parse('2026-11-23T09:35:00Z') /* 5 min ahead */]) {
      const t0 = deviceStart(400, deviceNow); // server: capture started 0.4 s ago
      expect(elapsedSince(t0, deviceNow)).toBe(400);
      expect(elapsedSince(t0, deviceNow + 2_000)).toBe(2_400); // a photo 2 s later
    }
  });

  it('resuming after a page reload keeps the true elapsed time', () => {
    const deviceNow = 1_000_000;
    expect(elapsedSince(deviceStart(12 * 60_000, deviceNow), deviceNow + 5_000)).toBe(12 * 60_000 + 5_000);
  });

  it('is never negative, and 0 before capture starts', () => {
    expect(elapsedSince(deviceStart(-1_500, 10_000), 10_000)).toBe(0); // server clock skew can't make it negative
    expect(elapsedSince(1_000, 500)).toBe(0);
    expect(elapsedSince(null)).toBe(0);
  });
});
