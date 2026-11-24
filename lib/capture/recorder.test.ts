import { describe, expect, it, vi } from 'vitest';
import { segmentedRecorder, type RecorderLike } from './recorder';

/** Fake MediaRecorder: each instance is one complete "file" named after its index. */
function fakes() {
  const made: (RecorderLike & { id: number })[] = [];
  const create = () => {
    const r = {
      id: made.length,
      state: 'inactive',
      ondataavailable: null as RecorderLike['ondataavailable'],
      onstop: null as RecorderLike['onstop'],
      start() {
        r.state = 'recording';
      },
      stop() {
        r.state = 'inactive';
        // like the browser: data first, then stop — asynchronously
        queueMicrotask(() => {
          r.ondataavailable?.({ data: new Blob([`HEADER+clip${r.id}`], { type: 'audio/webm' }) });
          r.onstop?.();
        });
      },
    };
    made.push(r);
    return r;
  };
  return { made, create };
}

describe('segmentedRecorder', () => {
  it('every clip is a separate recording, stamped with when it started', async () => {
    vi.useFakeTimers();
    let t = 0;
    const { made, create } = fakes();
    const clips: { text: string; start: number }[] = [];
    const rec = segmentedRecorder({ create, segmentMs: 5000, now: () => t, onClip: (b, start) => void b.text().then((text) => clips.push({ text, start })) });

    rec.start();
    for (const step of [5000, 5000]) {
      t += step;
      vi.advanceTimersByTime(step);
    }
    t += 1200;
    await rec.stop();
    await Promise.resolve();
    vi.useRealTimers();

    expect(made).toHaveLength(3); // a new recorder per clip
    expect(made.every((r) => r.state === 'inactive')).toBe(true);
    expect(clips).toEqual([
      { text: 'HEADER+clip0', start: 0 },
      { text: 'HEADER+clip1', start: 5000 },
      { text: 'HEADER+clip2', start: 10000 },
    ]);
  });

  it('the next clip starts before the previous one stops (no gap in speech)', () => {
    vi.useFakeTimers();
    const { made, create } = fakes();
    const rec = segmentedRecorder({ create, segmentMs: 5000, now: () => 0, onClip: () => {} });
    rec.start();
    const first = made[0];
    const realStop = first.stop.bind(first);
    let recordersRunningWhenFirstStopped = -1;
    first.stop = () => {
      recordersRunningWhenFirstStopped = made.filter((r) => r.state === 'recording').length;
      realStop();
    };
    vi.advanceTimersByTime(5000);
    expect(recordersRunningWhenFirstStopped).toBe(2); // clip 2 was already recording
    expect(made[1].state).toBe('recording');
    vi.useRealTimers();
  });

  it('stop() waits for the last clip and is safe to call twice', async () => {
    const { create } = fakes();
    const onClip = vi.fn();
    const rec = segmentedRecorder({ create, segmentMs: 5000, now: () => 0, onClip });
    rec.start();
    await rec.stop();
    expect(onClip).toHaveBeenCalledTimes(1);
    await rec.stop();
    expect(onClip).toHaveBeenCalledTimes(1);
  });
});
