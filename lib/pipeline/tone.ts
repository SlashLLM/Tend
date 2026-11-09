/**
 * Step 8 · Tone Guard: flags judgemental words and suggests developmental wording (PRD §8, §9).
 */
export const TONE_WORDS = ['failed', 'poor', 'weak', 'lacks', 'unable', 'should have', 'wrong', 'never', 'always', 'careless', 'inadequate', 'below standard'] as const;

const REWRITE: [RegExp, string][] = [
  [/\bfailed to\b/gi, 'has an opportunity to'],
  [/\bfailed\b/gi, 'did not yet manage'],
  [/\bshould have\b/gi, 'could try to'],
  [/\bwas unable to\b/gi, 'is still building towards'],
  [/\bunable to\b/gi, 'still building towards'],
  [/\blacks\b/gi, 'is developing'],
  [/\bpoor\b/gi, 'developing'],
  [/\bweak\b/gi, 'growing'],
  [/\bwrong\b/gi, 'not yet the best fit'],
  [/\bnever\b/gi, 'not yet'],
  [/\balways\b/gi, 'often'],
  [/\bcareless\b/gi, 'quick'],
  [/\binadequate\b/gi, 'still developing'],
  [/\bbelow standard\b/gi, 'an area to grow'],
];

export type ToneFlag = { word: string; index: number; suggestion: string };

export function toneFlags(text: string): ToneFlag[] {
  const flags: ToneFlag[] = [];
  for (const w of TONE_WORDS) {
    const re = new RegExp(`\\b${w.replace(' ', '\\s+')}\\b`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) flags.push({ word: m[0], index: m.index, suggestion: rewrite(text) });
  }
  return flags.sort((a, b) => a.index - b.index);
}

/** Deterministic developmental rewrite of a whole sentence. */
export function rewrite(text: string): string {
  let out = text;
  for (const [re, rep] of REWRITE) out = out.replace(re, rep);
  return out.replace(/\s{2,}/g, ' ');
}

export const hasToneIssue = (text: string) => toneFlags(text).length > 0;
