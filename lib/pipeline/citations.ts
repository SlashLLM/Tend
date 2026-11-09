/**
 * Step 7 guard · Every sentence must cite evidence. Uncited sentences are removed
 * automatically; limits from the writing rules are enforced in code (PRD §8):
 * ≤ 3 Glows, ≤ 2 Grows, exactly 1 Next step, ≤ 220 words, no scores or comparisons.
 */
import type { NarrativeContent, Sentence } from './types';

export const MAX_WORDS = 220;
const SCORE_RE = /\b\d+(\.\d+)?\s*(\/\s*\d+|%|points?)\b|\bscore[ds]?\b|\branked?\b|\bcompared (to|with) (other|her|his) (colleagues|educators|teachers)\b/i;

export const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function valid(s: Sentence | undefined, ids: Set<string>): s is Sentence {
  if (!s || !s.text?.trim()) return false;
  const cited = (s.evidence_ids ?? []).filter((id) => ids.has(id));
  if (cited.length === 0) return false;
  if (SCORE_RE.test(s.text)) return false;
  s.evidence_ids = [...new Set(cited)];
  return true;
}

export type EnforceResult = { content: NarrativeContent; removed: number };

export function enforceCitations(draft: NarrativeContent, validEvidenceIds: string[]): EnforceResult {
  const ids = new Set(validEvidenceIds);
  const before = draft.glows.length + draft.grows.length + 1;
  const glows = draft.glows.map((s) => ({ ...s })).filter((s) => valid(s, ids)).slice(0, 3);
  const grows = draft.grows.map((s) => ({ ...s })).filter((s) => valid(s, ids)).slice(0, 2);
  let next = draft.next_step ? { ...draft.next_step } : undefined;
  if (!valid(next, ids)) {
    // Fall back to the first grow's evidence so there is always one owned next step.
    const anchor = grows[0] ?? glows[0];
    next = anchor ? { text: draft.next_step?.text && !SCORE_RE.test(draft.next_step.text) ? draft.next_step.text : 'Choose one small thing from today to try again this week.', evidence_ids: anchor.evidence_ids, goal_id: draft.next_step?.goal_id ?? null } : undefined;
  }
  let content: NarrativeContent = { glows, grows, next_step: (next ?? { text: '', evidence_ids: [], goal_id: null }) as NarrativeContent['next_step'] };
  // Word cap: trim from the end of the lowest-priority list first (extra glows, then grows).
  const total = () => [...content.glows, ...content.grows, content.next_step].reduce((a, s) => a + words(s.text), 0);
  while (total() > MAX_WORDS && (content.glows.length > 1 || content.grows.length > 1)) {
    if (content.glows.length > 1) content = { ...content, glows: content.glows.slice(0, -1) };
    else content = { ...content, grows: content.grows.slice(0, -1) };
  }
  const after = content.glows.length + content.grows.length + (content.next_step.text ? 1 : 0);
  return { content, removed: before - after };
}

export function narrativeText(c: NarrativeContent) {
  return [...c.glows.map((s) => s.text), ...c.grows.map((s) => s.text), c.next_step.text].join('\n');
}
