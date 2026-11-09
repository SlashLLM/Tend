/**
 * Offline (no-AI-key) versions of the tag / draft / cards steps. Rule-based, deterministic,
 * built only from registry data (look-fors, level descriptors). With GPT-6 Luna enabled,
 * luna.ts replaces these — the same guards (shortlist, citations, tone) apply to both.
 */
import { tokenize, type Retrieved } from './retrieve';
import type { CardDraft, EvidenceUnit, IndicatorDoc, NarrativeContent, PipelineContext, TagDraft } from './types';

const L3_CUES = /follow(ed|s)?[- ]up|what makes you think|built on|builds? on|each other|child[- ]led|let (the )?children (lead|decide|choose|plan)|invited (the )?(others|children|class) to respond|took the lead|peers?\b|extended (it|the|their)/i;
const L2_CUES = /\b(why|how|what if|i wonder|wonder)\b|open[- ]ended|open question|waited|pause[sd]?\b|named (the|their|his|her) feeling|specific|offered (a |two )?choices?|strategy|described what/i;
const GROW_CUES = /\b(could|missed|no one|nobody|did not|didn['’]t|closed|yes\/no|rushed|interrupted|answered (it )?(her|him)self|without waiting|lost interest|told (them|the children)|no response)\b|\b(go(es)?|went|were|stayed|fell) quiet\b|\bmov(e|es|ed|ing) on\b|\bbefore (he|she|they|the child|child [a-z]) (can|could|had)\b|\bonly\b(?! child)/i;

export function levelFromCues(text: string): 1 | 2 | 3 {
  if (L3_CUES.test(text)) return 3;
  if (L2_CUES.test(text)) return 2;
  return 1;
}

export function valenceFromCues(text: string, _level: number): 'glow' | 'grow' {
  void _level;
  // A plain observation of practice is a Glow; a missed opportunity is a Grow.
  return GROW_CUES.test(text) ? 'grow' : 'glow';
}

function bestLookFor(doc: IndicatorDoc, text: string) {
  const t = new Set(tokenize(text));
  return [...doc.look_fors].sort((a, b) => overlap(b, t) - overlap(a, t))[0] ?? doc.name;
}
const overlap = (s: string, t: Set<string>) => tokenize(s).filter((w) => t.has(w)).length;

const MIN_SCORE = 1.5;

/** Step 5 · Tag: 0–2 indicators per unit, from the retrieval shortlist only. */
export function tagOffline(units: EvidenceUnit[], shortlist: (u: EvidenceUnit) => Retrieved[], docs: Map<string, IndicatorDoc>): TagDraft[] {
  const out: TagDraft[] = [];
  for (const u of units) {
    const cands = shortlist(u);
    if (cands.length === 0 || cands[0].score < MIN_SCORE) continue;
    const level = levelFromCues(u.text);
    const valence = valenceFromCues(u.text, level);
    const picks = [cands[0], ...(cands[1] && cands[1].score >= cands[0].score * 0.85 && docs.get(cands[1].code)?.subdomain_code !== docs.get(cands[0].code)?.subdomain_code ? [cands[1]] : [])];
    for (const [i, c] of picks.entries()) {
      const doc = docs.get(c.code)!;
      const margin = cands[1] ? (c.score - (cands[i + 1]?.score ?? 0)) / c.score : 1;
      const confidence = Math.max(0.3, Math.min(0.92, 0.4 + Math.min(c.score, 12) / 30 + margin * 0.2 + (u.starred ? 0.05 : 0) - i * 0.15));
      out.push({ unitIdx: u.idx, indicator: c.code, level, valence, confidence: Math.round(confidence * 100) / 100, reason: `Matches “${bestLookFor(doc, u.text)}”` });
    }
  }
  return out;
}

const WHY: Record<string, string> = {
  '1.1': 'warm, responsive moments help children feel safe enough to try',
  '2.1': 'children learn values best when they see and name them in real moments',
  '2.2': 'naming and managing feelings helps children get along and learn',
  '2.3': 'curiosity and persistence carry children through harder learning',
  '3.1': 'well-planned experiences let every child find a way in',
  '3.2': 'choice and play give children ownership of their learning',
  '3.3': 'open questions and real conversations stretch children’s thinking and language',
  '3.4': 'self-regulation and planning are the foundations of later learning',
};

const SAY_IT: Record<string, string> = {
  '1.1': '“I can see you worked hard on that. Tell me about it.”',
  '2.1': '“You waited for Ben — that was kind. How do you think he felt?”',
  '2.2': '“You look frustrated. Shall we take three slow breaths together?”',
  '2.3': '“That was tricky and you kept going. What will you try next?”',
  '3.1': '“Choose the level you’d like to try today.”',
  '3.2': '“What would you like to make? What will you need?”',
  '3.3': '“Why do you think that happened? What makes you think so?”',
  '3.4': '“What’s your plan? Let’s check it when we finish.”',
};

const excerpt = (s: string, n = 18) => {
  const w = s.trim().split(/\s+/);
  return w.length <= n ? s.trim().replace(/[.]$/, '') : `${w.slice(0, n).join(' ')}…`;
};

/** Step 7 · Draft: up to 3 Glows, up to 2 Grows, 1 Next step — every sentence cites its unit. */
export function draftOffline(
  units: EvidenceUnit[],
  unitIds: Map<number, string>,
  tags: TagDraft[],
  docs: Map<string, IndicatorDoc>,
  ctx: PipelineContext,
): NarrativeContent {
  const byConf = [...tags].sort((a, b) => b.confidence - a.confidence);
  // A Glow and a Grow may share an indicator (e.g. a strong why-question, then a missed follow-up).
  // Grows on the educator's chosen focus come first.
  const pick = (v: 'glow' | 'grow', n: number) => {
    const seen = new Set<string>();
    const pool = v === 'grow' ? [...byConf].sort((a, b) => Number(ctx.focusIndicatorCodes.includes(b.indicator)) - Number(ctx.focusIndicatorCodes.includes(a.indicator))) : byConf;
    return pool.filter((t) => t.valence === v && t.confidence >= 0.55 && !seen.has(t.indicator) && seen.add(t.indicator)).slice(0, n);
  };
  // Highest level seen per indicator in THIS observation: the next step aims one above it.
  const seenLevel = new Map<string, number>();
  for (const t of tags) seenLevel.set(t.indicator, Math.max(seenLevel.get(t.indicator) ?? 0, t.level));
  const aim = (code: string) => Math.min(3, (seenLevel.get(code) ?? 1) + 1);
  const glowTags = pick('glow', 3);
  const growTags = pick('grow', 2);
  const unit = (i: number) => units.find((u) => u.idx === i)!;

  const glows = glowTags.map((t) => {
    const d = docs.get(t.indicator)!;
    return { text: `${bestLookFor(d, unit(t.unitIdx).text)} — for example, “${excerpt(unit(t.unitIdx).text)}”.`, evidence_ids: [unitIds.get(t.unitIdx)!] };
  });
  const grows = growTags.map((t) => {
    const d = docs.get(t.indicator)!;
    const next = d.level_descriptors[String(aim(t.indicator))] ?? d.look_fors[0];
    return { text: `An opportunity to grow towards Level ${aim(t.indicator)} in ${d.name.toLowerCase()}: “${next.replace(/\.$/, '')}”. This matters because ${WHY[d.subdomain_code] ?? 'small steps add up for children'}.`, evidence_ids: [unitIds.get(t.unitIdx)!] };
  });

  // Next step: prefer a Grow on a focus goal, then any Grow, then the strongest Glow.
  const focusGrow = growTags.find((t) => ctx.focusIndicatorCodes.includes(t.indicator));
  const anchor = focusGrow ?? growTags[0] ?? glowTags[0];
  let next_step: NarrativeContent['next_step'] = { text: '', evidence_ids: [], goal_id: null };
  if (anchor) {
    const d = docs.get(anchor.indicator)!;
    const goal = ctx.goals.find((g) => g.code === anchor.indicator) ?? null;
    const action = d.level_descriptors[String(aim(anchor.indicator))] ?? bestLookFor(d, unit(anchor.unitIdx).text);
    next_step = {
      text: `Next step: once this week, try “${action.replace(/\.$/, '')}”${goal ? ` — a step towards your goal ${d.code}` : ''}.`,
      evidence_ids: [unitIds.get(anchor.unitIdx)!],
      goal_id: goal?.id ?? null,
    };
  }
  return { glows, grows, next_step };
}

/** Step 9 · Coaching cards: 1 per Grow, < 150 words, grounded in registry strategies. */
export function cardsOffline(growTags: TagDraft[], docs: Map<string, IndicatorDoc>, ctx: PipelineContext): CardDraft[] {
  const younger = ctx.classLevel && ['IC', 'PG', 'N1'].includes(ctx.classLevel);
  return growTags.slice(0, 2).map((t) => {
    const d = docs.get(t.indicator)!;
    const target = d.level_descriptors[String(Math.min(3, t.level + 1))] ?? d.look_fors[0];
    return {
      indicator: d.code,
      title: d.look_fors[0],
      body: {
        why: `${WHY[d.subdomain_code] ? WHY[d.subdomain_code].charAt(0).toUpperCase() + WHY[d.subdomain_code].slice(1) : 'Small steps add up'}.`,
        try_tomorrow: target,
        say_it: SAY_IT[d.subdomain_code] ?? '“Tell me more about that.”',
        adapt_by_age: younger ? 'For younger children, keep it to one short step and use gestures or pictures.' : 'For older children, invite them to explain and to respond to a friend’s idea.',
        reflect_after: 'What did the children do or say differently?',
      },
    };
  });
}
