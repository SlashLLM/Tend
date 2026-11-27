/**
 * Step 3 · Segment (offline version): split the capture into evidence units — single,
 * self-contained observations linked to their timestamps, photos and ★ moments.
 */
import type { CaptureItem, EvidenceUnit } from './types';

const SENTENCE = /(?<=[.!?])\s+(?=[A-Z“"‘'(])/;

/** Build a timeline of text pieces from transcripts and notes. */
export function timeline(items: CaptureItem[]) {
  return items
    .filter((i) => (i.kind === 'audio_chunk' && i.transcript?.trim()) || (i.kind === 'note' && i.text?.trim()))
    .sort((a, b) => a.t_offset_ms - b.t_offset_ms)
    .map((i) => ({ id: i.id, t: i.t_offset_ms, text: (i.kind === 'note' ? i.text : i.transcript)!.trim() }));
}

export function segmentOffline(items: CaptureItem[], { maxChars = 220 } = {}): EvidenceUnit[] {
  const kinds = new Map(items.map((i) => [i.id, i.kind]));
  const pieces = timeline(items).flatMap((p) => p.text.split(SENTENCE).map((s, k) => ({ ...p, text: s.trim(), first: k === 0 })).filter((s) => s.text.length > 0));
  const moments = items.filter((i) => i.kind === 'moment').map((i) => i.t_offset_ms);
  const photos = items.filter((i) => i.kind === 'photo' || i.kind === 'video'); // still and moving images

  const units: EvidenceUnit[] = [];
  let cur: { texts: string[]; ids: Set<string>; start: number; end: number } | null = null;
  const flush = () => {
    if (!cur) return;
    units.push({ idx: units.length, text: cur.texts.join(' '), start_ms: cur.start, end_ms: cur.end, capture_item_ids: [...cur.ids], starred: false });
    cur = null;
  };
  for (const p of pieces) {
    // A ★ moment between pieces starts a new unit; so does length.
    const momentBetween = cur && moments.some((m) => m > cur!.end && m <= p.t);
    // Each dictated/typed note is one observation; audio transcripts are merged up to maxChars.
    const newNote = p.first && kinds.get(p.id) === 'note';
    if (cur && (newNote || momentBetween || (cur.texts.join(' ').length + p.text.length > maxChars) || p.t - cur.end > 90_000)) flush();
    if (!cur) cur = { texts: [], ids: new Set(), start: p.t, end: p.t };
    cur.texts.push(p.text);
    cur.ids.add(p.id);
    cur.end = Math.max(cur.end, p.t);
  }
  flush();

  // Attach ★ moments and photos to the nearest unit (within 60 s).
  for (const u of units) {
    u.end_ms = Math.max(u.end_ms, u.start_ms + 5_000);
    u.starred = moments.some((m) => m >= u.start_ms - 15_000 && m <= u.end_ms + 15_000);
  }
  for (const ph of photos) {
    const nearest = units.reduce<EvidenceUnit | null>((best, u) => {
      const d = Math.min(Math.abs(u.start_ms - ph.t_offset_ms), Math.abs(u.end_ms - ph.t_offset_ms));
      const bd = best ? Math.min(Math.abs(best.start_ms - ph.t_offset_ms), Math.abs(best.end_ms - ph.t_offset_ms)) : Infinity;
      return d < bd ? u : best;
    }, null);
    if (nearest && Math.min(Math.abs(nearest.start_ms - ph.t_offset_ms), Math.abs(nearest.end_ms - ph.t_offset_ms)) <= 60_000) nearest.capture_item_ids.push(ph.id);
  }
  return units;
}
