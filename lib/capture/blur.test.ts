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

import { stickyBoxes, videoPlan } from './video-blur';

describe('video blur plan', () => {
  it('scales to 720p on the long side with even sizes, and refuses long clips', () => {
    expect(videoPlan(12, 1920, 1080)).toEqual({ W: 720, H: 406, tooLong: false });
    expect(videoPlan(12, 1080, 1920)).toEqual({ W: 406, H: 720, tooLong: false });
    expect(videoPlan(12, 640, 480)).toEqual({ W: 640, H: 480, tooLong: false });
    expect(videoPlan(30.4, 640, 480).tooLong).toBe(false);
    expect(videoPlan(31, 640, 480).tooLong).toBe(true);
    expect(videoPlan(Number.POSITIVE_INFINITY, 640, 480).tooLong).toBe(true); // unknown length (streamed) is refused
  });

  it('keeps a face blurred for a few frames after the detector loses it', () => {
    const face = { x: 1, y: 1, w: 10, h: 10 };
    let h: ReturnType<typeof stickyBoxes>['history'] = [];
    ({ history: h } = stickyBoxes(h, [face]));
    let r = stickyBoxes(h, []); // missed on this frame
    expect(r.boxes).toContainEqual(face);
    for (let i = 0; i < 4; i++) r = stickyBoxes(r.history, []);
    expect(r.boxes).toEqual([]); // ...but not forever
    expect(r.history.length).toBe(4);
  });
});
