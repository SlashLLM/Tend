import { describe, expect, it } from 'vitest';
import { retranscribeClips, vocabularyPrompt, type AudioClip } from './retranscribe';
import { runPipeline } from './run';
import type { CaptureItem } from './types';

const clip = (id: string, t: number, transcript: string | null, path: string | null = `org/obs/${id}.webm`): AudioClip => ({
  id, kind: 'audio_chunk', t_offset_ms: t, text: null, transcript, storage_path: path,
});

describe('second-pass transcription', () => {
  it('builds a short vocabulary hint from QTT names, class and educator — no children', () => {
    const p = vocabularyPrompt([{ name: 'Extending Thinking Through Questioning' }, { name: 'Facilitating Self-Regulation Skills' }], ['Aisha', 'K1', null, '']);
    expect(p).toContain('Aisha, K1, Extending Thinking Through Questioning');
    expect(p.length).toBeLessThan(800);
    const long = vocabularyPrompt(Array.from({ length: 200 }, (_, i) => ({ name: `Indicator name number ${i}` })));
    expect(long.length).toBeLessThan(800);
  });

  it('replaces live text with the better pass, keeps it on failure, saves only changes, uses the previous clip as context', async () => {
    const items: CaptureItem[] = [clip('a', 0, 'she ask what happen next'), clip('c', 5000, 'same words'), clip('b', 10000, null),{ id: 'n', kind: 'note', t_offset_ms: 2000, text: 'note', transcript: null }];
    const prompts: string[] = [];
    const saved: string[] = [];
    const res = await retranscribeClips(items, items as AudioClip[], 'VOCAB', {
      download: async (path) => {
        if (path.endsWith('b.webm')) throw new Error('gone');
        return new TextEncoder().encode(path);
      },
      transcribe: async (audio, prompt) => {
        prompts.push(prompt);
        const p = new TextDecoder().decode(audio);
        return p.endsWith('a.webm') ? 'She asked, “What happens next?”' : 'same words';
      },
      save: async (id) => void saved.push(id),
    });
    expect(res.items.find((i) => i.id === 'a')!.transcript).toBe('She asked, “What happens next?”');
    expect(res.items.find((i) => i.id === 'b')!.transcript).toBeNull(); // failed → unchanged
    expect(res.items.find((i) => i.id === 'n')).toEqual(items[3]); // notes untouched
    expect(saved).toEqual(['a']); // 'c' was identical
    expect(res.improved).toBe(1);
    expect(prompts.some((p) => p.includes('Previous words: she ask what happen next'))).toBe(true);
  });

  it('stops at the time budget so the draft is never late; the rest keep live text', async () => {
    let t = 0;
    const clips = Array.from({ length: 10 }, (_, i) => clip(`k${i}`, i * 5000, `live ${i}`));
    const res = await retranscribeClips(clips, clips, 'V', {
      now: () => t,
      download: async () => new Uint8Array(),
      transcribe: async () => {
        t += 1000;
        return 'better';
      },
      save: async () => {},
    }, { concurrency: 1, deadlineMs: 3000 });
    expect(res.attempted).toBe(3);
    expect(res.skipped).toBe(7);
    expect(res.items.filter((i) => i.transcript === 'better')).toHaveLength(3);
    expect(res.items[9].transcript).toBe('live 9');
  });

  it('the pipeline redacts second-pass text and survives a failing second pass', async () => {
    const items: CaptureItem[] = [{ id: 'a', kind: 'audio_chunk', t_offset_ms: 0, text: null, transcript: 'live words' }];
    const base = { orgId: 'o', observationId: 'x', items, roster: [{ child_name: 'Mei', aliases: [] }], docs: [], lastLevels: '',
      ctx: { focusIndicatorCodes: [], goals: [], educatorFirstName: 'Aisha', classLevel: 'K1', locale: 'en' } };
    let n = 0;
    const deps = { gateway: null, setStep: () => {}, newId: () => `id${n++}` };
    const out = await runPipeline(base, { ...deps, retranscribe: async (it) => it.map((i) => ({ ...i, transcript: 'Mei asked why the moon changes shape' })) });
    expect(out.units.map((u) => u.text).join(' ')).toContain('Child A asked why the moon');
    expect(out.units.map((u) => u.text).join(' ')).not.toContain('Mei');
    const out2 = await runPipeline(base, { ...deps, retranscribe: async () => { throw new Error('stt down'); } });
    expect(out2.units.map((u) => u.text).join(' ')).toContain('live words');
  });
});
