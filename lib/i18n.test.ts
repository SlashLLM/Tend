import { describe, expect, it } from 'vitest';
import en from '../messages/en.json';
import zh from '../messages/zh.json';

type Tree = { [k: string]: string | Tree };

function leaves(obj: Tree, prefix = ''): [string, string][] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'string' ? [[`${prefix}${k}`, v] as [string, string]] : leaves(v, `${prefix}${k}.`),
  );
}
// ICU-aware: `{n}` and `{n, plural, …}` both name the argument `n`; plural branch text (`{# item}`) is not an argument.
const placeholders = (s: string) => [...new Set([...s.matchAll(/\{\s*(\w+)\s*(?=[,}])/g)].map((m) => m[1]))].sort();

describe('messages', () => {
  const enLeaves = new Map(leaves(en as Tree));
  const zhLeaves = new Map(leaves(zh as Tree));

  it('zh has exactly the same keys as en', () => {
    expect([...zhLeaves.keys()].sort()).toEqual([...enLeaves.keys()].sort());
  });

  it('every translation keeps the same {placeholders}', () => {
    for (const [k, v] of enLeaves) expect(placeholders(zhLeaves.get(k) ?? ''), k).toEqual(placeholders(v));
  });

  it('no empty strings', () => {
    for (const [k, v] of [...enLeaves, ...zhLeaves]) expect(v.trim().length, k).toBeGreaterThan(0);
  });

  it('uses developmental words only (PRD §9 "Words to use")', () => {
    const banned = [/\bscore/i, /\bweakness/i, /\bfailed\b/i, /\bpoor\b/i, /evaluation report/i, /non-compliant/i, /\bsubmit\b/i, /\brank/i];
    for (const [k, v] of enLeaves) for (const b of banned) expect(b.test(v), `${k}: "${v}" matches ${b}`).toBe(false);
  });
});
