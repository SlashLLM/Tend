/**
 * Dictation in self-contained clips.
 *
 * `MediaRecorder.start(5000)` emits 5-second slices of ONE recording: only the first slice carries the
 * WebM header, so every later slice is a fragment that can't be decoded (or transcribed, or played)
 * on its own — in practice only the first 5 s of each dictation was ever transcribed. Instead a fresh
 * recorder is started on the same microphone stream every `segmentMs`, and each recorder's output is
 * a complete file. The next recorder starts before the previous one stops, so no speech falls in a gap.
 */
export type RecorderLike = {
  state: string;
  start(): void;
  stop(): void;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
};

export type SegmentedRecorder = { start(): void; stop(): Promise<void> };

export function segmentedRecorder(opts: {
  create: () => RecorderLike;
  /** Clip length. */
  segmentMs: number;
  /** Capture-relative time, used to stamp each clip with when it STARTED. */
  now: () => number;
  onClip: (clip: Blob, startMs: number) => void;
  timers?: { setInterval: typeof setInterval; clearInterval: typeof clearInterval };
}): SegmentedRecorder {
  // Wrapped, not `{ setInterval, clearInterval }`: browsers throw "Illegal invocation" when these
  // are called as methods of another object.
  const timers = opts.timers ?? {
    setInterval: ((fn: () => void, ms: number) => setInterval(fn, ms)) as typeof setInterval,
    clearInterval: ((id: ReturnType<typeof setInterval>) => clearInterval(id)) as typeof clearInterval,
  };
  let current: RecorderLike | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const inFlight = new Set<Promise<void>>();

  function open(): RecorderLike {
    const startMs = opts.now();
    const rec = opts.create();
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) parts.push(e.data);
    };
    const done = new Promise<void>((resolve) => {
      rec.onstop = () => {
        if (parts.length) opts.onClip(new Blob(parts, { type: parts[0].type }), startMs);
        resolve();
      };
    });
    inFlight.add(done);
    void done.then(() => inFlight.delete(done));
    rec.start();
    return rec;
  }

  return {
    start() {
      if (current) return;
      current = open();
      timer = timers.setInterval(() => {
        const old = current;
        current = open();
        if (old && old.state !== 'inactive') old.stop();
      }, opts.segmentMs);
    },
    /** Stops recording; resolves once every clip has been handed to `onClip`. */
    async stop() {
      if (timer !== null) timers.clearInterval(timer);
      timer = null;
      const last = current;
      current = null;
      if (last && last.state !== 'inactive') last.stop();
      await Promise.all([...inFlight]);
    },
  };
}
