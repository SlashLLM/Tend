import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { makeProgressWriter } from './progress';

function fakeAdmin(writes: string[], delayMs = 5) {
  return {
    from: () => ({
      update: (v: { pipeline_step: string }) => ({
        eq: async () => {
          await new Promise((r) => setTimeout(r, delayMs));
          writes.push(v.pipeline_step);
        },
      }),
    }),
  } as unknown as SupabaseClient;
}

describe('makeProgressWriter', () => {
  it('never blocks the caller and coalesces a burst to the latest step', async () => {
    const writes: string[] = [];
    const w = makeProgressWriter(fakeAdmin(writes), 'obs');
    for (const s of ['transcribe', 'redact', 'segment', 'retrieve', 'tag']) w.set(s);
    expect(writes).toEqual([]);
    await w.flush();
    expect(writes.at(-1)).toBe('tag');
    expect(writes.length).toBeLessThan(5);
  });

  it('flush() leaves nothing in flight, so a final status write cannot be overtaken by a stale step', async () => {
    const writes: string[] = [];
    const w = makeProgressWriter(fakeAdmin(writes), 'obs');
    w.set('draft');
    w.set('save');
    await w.flush();
    const settled = writes.length;
    await new Promise((r) => setTimeout(r, 30));
    expect(writes.length).toBe(settled);
    expect(writes.at(-1)).toBe('save');
  });

  it('survives a failing write and keeps accepting steps', async () => {
    const writes: string[] = [];
    let first = true;
    const admin = {
      from: () => ({
        update: (v: { pipeline_step: string }) => ({
          eq: async () => {
            if (first) {
              first = false;
              throw new Error('network');
            }
            writes.push(v.pipeline_step);
          },
        }),
      }),
    } as unknown as SupabaseClient;
    const w = makeProgressWriter(admin, 'obs');
    w.set('a');
    await w.flush();
    w.set('b');
    await w.flush();
    expect(writes).toEqual(['b']);
  });
});
