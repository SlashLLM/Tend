/**
 * Pipeline step 1 · second-pass transcription (PRD §8: "re-transcribe the full recording at higher
 * accuracy after End").
 *
 * Dictation is captured as self-contained 5-second clips (see lib/capture/recorder.ts), so the
 * second pass re-transcribes every clip with the higher-accuracy model, giving it the QTT vocabulary
 * and the neighbouring clip's live text as context. It also recovers clips whose live transcription
 * failed. Pure and injectable, so it is unit-tested without a network.
 *
 * It must never delay the draft past its 60-second target: clips not finished by `deadlineMs` keep
 * their live text, and a failed clip keeps its live text too.
 */
import type { CaptureItem, IndicatorDoc } from './types';

export type AudioClip = CaptureItem & { storage_path: string | null };

export type RetranscribeDeps = {
  download: (path: string) => Promise<Uint8Array>;
  transcribe: (audio: Uint8Array, prompt: string) => Promise<string | null>;
  /** Persist one improved transcript (called only when it changed). */
  save: (itemId: string, transcript: string) => Promise<void>;
  now?: () => number;
};

export type RetranscribeResult = { items: CaptureItem[]; improved: number; attempted: number; skipped: number };

/** The prompt hint: QTT names and look-for words, plus class and educator — never children's names. */
export function vocabularyPrompt(docs: Pick<IndicatorDoc, 'name'>[], extra: (string | null | undefined)[] = []): string {
  const terms = [...new Set([...extra.filter((x): x is string => !!x?.trim()), ...docs.map((d) => d.name)])];
  // The model only reads the last ~224 tokens of a prompt; keep it short and put the names first.
  const out: string[] = [];
  let len = 0;
  for (const t of terms) {
    if (len + t.length + 2 > 700) break;
    out.push(t);
    len += t.length + 2;
  }
  return `Preschool classroom observation notes, Singapore English. Terms: ${out.join(', ')}.`;
}

export async function retranscribeClips(items: CaptureItem[], clips: AudioClip[], vocab: string, deps: RetranscribeDeps, opts: { concurrency?: number; deadlineMs?: number } = {}): Promise<RetranscribeResult> {
  const now = deps.now ?? Date.now;
  const deadline = now() + (opts.deadlineMs ?? 30_000);
  const concurrency = Math.max(1, opts.concurrency ?? 8);
  const audio = clips.filter((c) => c.kind === 'audio_chunk' && c.storage_path).sort((a, b) => a.t_offset_ms - b.t_offset_ms);
  const better = new Map<string, string>();
  let next = 0;
  let attempted = 0;

  async function worker() {
    while (next < audio.length && now() < deadline) {
      const i = next++;
      const clip = audio[i];
      attempted++;
      try {
        const prev = audio[i - 1]?.transcript?.trim();
        const prompt = prev ? `${vocab} Previous words: ${prev.slice(-200)}` : vocab;
        const text = (await deps.transcribe(await deps.download(clip.storage_path!), prompt))?.trim();
        if (text && text !== clip.transcript?.trim()) {
          better.set(clip.id, text);
          await deps.save(clip.id, text);
        }
      } catch {
        /* keep the live transcript for this clip */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, audio.length) }, worker));

  return {
    items: items.map((it) => (better.has(it.id) ? { ...it, transcript: better.get(it.id)! } : it)),
    improved: better.size,
    attempted,
    skipped: audio.length - attempted,
  };
}
