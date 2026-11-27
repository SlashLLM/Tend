/**
 * Capture times are offsets from the moment capture started. The start is stamped by the database,
 * but "now" is read on the device, whose clock can be seconds or minutes off. Subtracting one clock
 * from the other gave negative offsets (items rejected, then dropped) or inflated ones.
 *
 * Instead the server sends how long ago capture started — a duration, which is the same on every
 * clock — and the device anchors the start on its own clock. Every offset after that is device
 * clock minus device clock.
 */

/** Capture start on this device's clock, given how long ago (per the server) capture started. */
export function deviceStart(elapsedMs: number, deviceNowMs: number = Date.now()): number {
  return deviceNowMs - Math.max(0, elapsedMs);
}

/** Milliseconds since `t0` (device clock), never negative. */
export function elapsedSince(t0: number | null, deviceNowMs: number = Date.now()): number {
  return t0 === null ? 0 : Math.max(0, deviceNowMs - t0);
}

/**
 * A capture page reloaded offline comes from the service-worker cache, so its "elapsed" is as old as
 * that copy and would restart the clock — and reused offsets mean reused item numbers, which the
 * server would discard as duplicates. The start this device remembered wins when it is earlier
 * (same device clock, so the earlier one is the true start).
 */
export function resumeStart(derivedT0: number, rememberedT0: number | null): number {
  return rememberedT0 !== null && Number.isFinite(rememberedT0) && rememberedT0 < derivedT0 ? rememberedT0 : derivedT0;
}

const startKey = (obsId: string) => `tend-capture-t0:${obsId}`;

export function rememberStart(obsId: string, t0: number) {
  try {
    localStorage.setItem(startKey(obsId), String(Math.round(t0)));
  } catch {
    /* private mode: offline reloads fall back to the page's own clock */
  }
}

export function recallStart(obsId: string): number | null {
  try {
    const v = localStorage.getItem(startKey(obsId));
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

export function forgetStart(obsId: string) {
  try {
    localStorage.removeItem(startKey(obsId));
  } catch {
    /* nothing to clean */
  }
}
