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
