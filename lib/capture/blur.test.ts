import { describe, expect, it } from 'vitest';
import { padBox } from './blur';

describe('padBox (face blur covers hair and ears)', () => {
  it('grows the box by 35% on each side', () => {
    expect(padBox({ x: 100, y: 100, w: 100, h: 100 }, 1000, 1000)).toEqual({ x: 65, y: 65, w: 170, h: 170 });
  });
  it('never leaves the image', () => {
    const b = padBox({ x: 5, y: 5, w: 100, h: 100 }, 120, 120);
    expect(b.x).toBe(0);
    expect(b.y).toBe(0);
    expect(b.x + b.w).toBeLessThanOrEqual(120);
    expect(b.y + b.h).toBeLessThanOrEqual(120);
  });
});
