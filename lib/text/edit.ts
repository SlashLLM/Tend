/** Levenshtein distance over arbitrary token arrays (chars or words). O(n·m) time, O(m) memory. */
export function levenshtein<T>(a: readonly T[], b: readonly T[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Share of the AI text the leader changed (0 = untouched, 1 = rewritten). Interpretation-acceptance KPI. */
export function editRatio(original: string, final: string): number {
  const a = [...original.trim()];
  const b = [...final.trim()];
  const denom = Math.max(a.length, b.length);
  if (denom === 0) return 0;
  return Math.min(1, Math.round((levenshtein(a, b) / denom) * 1000) / 1000);
}

/** Word error rate of an ASR transcript against the leader-corrected reference. */
export function wer(hypothesis: string, reference: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(Boolean);
  const h = norm(hypothesis);
  const r = norm(reference);
  if (r.length === 0) return h.length === 0 ? 0 : 1;
  return Math.min(1, Math.round((levenshtein(h, r) / r.length) * 1000) / 1000);
}
