/**
 * Step 4 · Retrieve: the 8 most likely indicators per evidence unit.
 * Offline: BM25 over indicator name + look-fors + level descriptors (+ a boost for the
 * educator's chosen focus). With an AI key, embeddings + pgvector replace this.
 */
import type { IndicatorDoc } from './types';

const STOP = new Set('a an the and or of to in on at for with by is are was were be been it its this that these those as from into about their they them she he her his you your i we our child children educator teacher class did does do has have had will would can could not no so then than very just also only'.split(' '));

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
}

/** Tiny suffix stemmer — enough to match "questioning"/"questions"/"question". */
export function stem(t: string): string {
  for (const suf of ['ingly', 'ings', 'ing', 'edly', 'ed', 'ies', 'es', 's', 'ly']) {
    if (t.length - suf.length >= 4 && t.endsWith(suf)) return suf === 'ies' ? `${t.slice(0, -3)}y` : t.slice(0, -suf.length);
  }
  return t;
}

/** Synonyms that bridge everyday classroom talk to framework wording. */
const EXPAND: Record<string, string[]> = {
  ask: ['question'], why: ['question', 'think'], how: ['question'], wait: ['wait', 'pause'], quiet: ['engag'],
  calm: ['regulat', 'self'], upset: ['emotion', 'feel'], cry: ['emotion', 'feel'], angry: ['emotion'], turn: ['wait', 'self'],
  share: ['prosocial'], help: ['prosocial', 'independ'], choose: ['choic', 'decision'], choice: ['choic'], plan: ['plan', 'goal'],
  story: ['language', 'print'], book: ['print', 'language'], word: ['vocabulary', 'language'], praise: ['feedback'], culture: ['diversity'],
  family: ['diversity', 'famil'], friend: ['convers', 'communic', 'peer'], tell: ['convers', 'communic'], talk: ['convers', 'communic'], puzzle: ['persever', 'problem'], build: ['inventiv', 'problem'], block: ['inventiv'], pretend: ['play'],
};

export type Retrieved = { code: string; score: number };

export function buildIndex(docs: IndicatorDoc[]) {
  const toks = docs.map((d) => tokenize([d.name, d.name, ...d.look_fors, ...Object.values(d.level_descriptors), d.subdomain_name].join(' ')));
  const N = docs.length;
  const avgdl = toks.reduce((a, t) => a + t.length, 0) / Math.max(1, N);
  const df = new Map<string, number>();
  for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1);
  const tf = toks.map((t) => {
    const m = new Map<string, number>();
    for (const w of t) m.set(w, (m.get(w) ?? 0) + 1);
    return m;
  });
  const k1 = 1.4;
  const b = 0.75;

  return function search(query: string, { k = 8, boost = [] as string[] } = {}): Retrieved[] {
    const q = tokenize(query).flatMap((w) => [w, ...(EXPAND[w] ?? [])]);
    const scores = docs.map((d, i) => {
      let s = 0;
      for (const w of q) {
        // prefix match lets "regulat" hit "regulation"/"regulate"
        for (const [term, f] of tf[i]) {
          if (term === w || (w.length >= 5 && term.startsWith(w))) {
            const n = df.get(term) ?? 0;
            const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
            s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * toks[i].length) / avgdl)));
          }
        }
      }
      if (boost.includes(d.code)) s *= 1.35;
      return { code: d.code, score: s };
    });
    return scores.filter((x) => x.score > 0).sort((a, z) => z.score - a.score || a.code.localeCompare(z.code)).slice(0, k);
  };
}
