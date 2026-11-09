/**
 * GPT-6 Luna versions of the pipeline steps. Every output is schema-validated; tag indicators are
 * constrained to the per-unit shortlist; the citation filter and Tone Guard run afterwards in code.
 */
import { z } from 'zod';
import type { Gateway } from '../ai/gateway';
import type { Retrieved } from './retrieve';
import type { CardDraft, EvidenceUnit, IndicatorDoc, NarrativeContent, PipelineContext, TagDraft } from './types';

const V = { segment: 'segment@1', tag: 'tag@1', draft: 'feedback.write@1', cards: 'cards@1', tone: 'tone@1' };

const COMMON =
  'You support preschool educators in Singapore using ECDA’s Quality Teaching Tool (QTT). QTT is a growth tool, never an appraisal: never give scores, averages, ranks or comparisons with other educators. Never name or diagnose children; refer to them as Child A, Child B. Use plain words (about a 12-year-old reading level).';

export async function segmentLuna(gw: Gateway, transcript: { t: number; text: string }[], ctx: { orgId: string; observationId: string }) {
  const schema = z.object({
    units: z.array(z.object({ text: z.string().min(3).max(400), start_ms: z.number().int().min(0), end_ms: z.number().int().min(0) })).min(1).max(40),
  });
  const { object } = await gw.runObject({
    task: 'segment',
    schema,
    promptVersion: V.segment,
    ctx,
    system: `${COMMON}\nSplit an observer's notes into evidence units: single, self-contained observations of the educator's practice, each with its time range. Keep the observer's words; do not invent anything.`,
    prompt: `Timeline (ms: text):\n${transcript.map((p) => `${p.t}: ${p.text}`).join('\n')}\nReturn JSON {"units":[{"text","start_ms","end_ms"}]}.`,
  });
  return object.units;
}

export async function tagLuna(
  gw: Gateway,
  units: EvidenceUnit[],
  shortlists: Map<number, Retrieved[]>,
  docs: Map<string, IndicatorDoc>,
  ctx: PipelineContext & { orgId: string; observationId: string },
): Promise<TagDraft[]> {
  const allCodes = [...new Set([...shortlists.values()].flat().map((r) => r.code))];
  if (allCodes.length === 0) return [];
  const schema = z.object({
    units: z.array(z.object({
      idx: z.number().int(),
      tags: z.array(z.object({
        indicator: z.enum(allCodes as [string, ...string[]]),
        level: z.number().int().min(1).max(3),
        valence: z.enum(['glow', 'grow']),
        confidence: z.number().min(0).max(1),
        reason: z.string().min(3).max(200),
      })).max(3),
    })),
  });
  const block = units
    .map((u) => {
      const sl = (shortlists.get(u.idx) ?? []).map((r) => {
        const d = docs.get(r.code)!;
        return `  - ${d.code} ${d.name} | L1: ${d.level_descriptors['1']} | L2: ${d.level_descriptors['2']} | L3: ${d.level_descriptors['3']}`;
      });
      return `UNIT ${u.idx}: "${u.text}"\n SHORTLIST:\n${sl.join('\n')}`;
    })
    .join('\n\n');
  const { object } = await gw.runObject({
    task: 'tag',
    schema,
    promptVersion: V.tag,
    ctx: { orgId: ctx.orgId, observationId: ctx.observationId },
    system: `${COMMON}\nTag each evidence unit with 0–3 indicators chosen ONLY from that unit's shortlist. For each: the level seen (1–3), glow (went well) or grow (opportunity), confidence 0–1, and a short reason that quotes the evidence. JSON only.`,
    prompt: `Educator focus: ${ctx.focusIndicatorCodes.join(', ') || 'none'}\n\n${block}`,
  });
  const out: TagDraft[] = [];
  for (const u of object.units) {
    const allowed = new Set((shortlists.get(u.idx) ?? []).map((r) => r.code));
    for (const t of u.tags) if (allowed.has(t.indicator)) out.push({ unitIdx: u.idx, ...t, level: t.level as 1 | 2 | 3 });
  }
  return out;
}

const SentenceSchema = z.object({ text: z.string().min(3).max(400), evidence_ids: z.array(z.string()).min(1) });

export async function draftLuna(
  gw: Gateway,
  units: { id: string; text: string }[],
  tags: (TagDraft & { unitId: string; name: string })[],
  ctx: PipelineContext & { orgId: string; observationId: string; lastLevels: string },
): Promise<NarrativeContent> {
  const ids = units.map((u) => u.id) as [string, ...string[]];
  const schema = z.object({
    glows: z.array(SentenceSchema).max(3),
    grows: z.array(SentenceSchema).max(2),
    next_step: SentenceSchema.extend({ goal_id: z.string().nullable() }),
  });
  const { object } = await gw.runObject({
    task: 'feedback.write',
    schema,
    promptVersion: V.draft,
    ctx: { orgId: ctx.orgId, observationId: ctx.observationId },
    temperature: 0.4,
    system: `${COMMON}
Write growth notes for the educator in ${ctx.locale === 'zh' ? 'Simplified Chinese' : 'English'}, second person.
Rules: Glows first (up to 3). Up to 2 Grows, each framed as an opportunity and saying why it matters for children. Exactly 1 concrete Next step linked to a goal id when one fits. EVERY sentence must cite evidence_ids from the list provided — uncited sentences are deleted. At most 220 words in total. Never use: failed, poor, weak, lacks, unable, should have, wrong, never, always, careless, inadequate, below standard.`,
    prompt: `Evidence units (id: text):\n${units.map((u) => `${u.id}: ${u.text}`).join('\n')}
Accepted tags:\n${tags.map((t) => `${t.unitId} → ${t.indicator} ${t.name} · L${t.level} · ${t.valence}`).join('\n')}
Educator focus: ${ctx.focusIndicatorCodes.join(', ') || 'none'}
Goals (id · indicator · now → aim): ${ctx.goals.map((g) => `${g.id} · ${g.code} · L${g.current_level ?? '?'} → L${g.target_level}`).join('; ') || 'none'}
Last observed levels: ${ctx.lastLevels || 'none'}
Valid evidence ids: ${ids.join(', ')}
Return JSON {"glows":[{"text","evidence_ids"}],"grows":[…],"next_step":{"text","evidence_ids","goal_id"}}.`,
  });
  return object;
}

export async function cardsLuna(gw: Gateway, grows: { indicator: IndicatorDoc; level: number; evidence: string }[], ctx: PipelineContext & { orgId: string; observationId: string }): Promise<CardDraft[]> {
  if (grows.length === 0) return [];
  const schema = z.object({
    cards: z.array(z.object({
      indicator: z.enum(grows.map((g) => g.indicator.code) as [string, ...string[]]),
      title: z.string().min(3).max(80),
      body: z.object({ why: z.string(), try_tomorrow: z.string(), say_it: z.string(), adapt_by_age: z.string(), reflect_after: z.string() }),
    })).max(4),
  });
  const { object } = await gw.runObject({
    task: 'cards',
    schema,
    promptVersion: V.cards,
    ctx: { orgId: ctx.orgId, observationId: ctx.observationId },
    system: `${COMMON}\nWrite micro-coaching cards (under 150 words each) with: why it matters, try tomorrow, say it like this, adapt by age, reflect after. One or two per opportunity. Practical and warm.`,
    prompt: `Class: ${ctx.classLevel ?? 'preschool'}\n${grows.map((g) => `${g.indicator.code} ${g.indicator.name} (seen at L${g.level}; next level: ${g.indicator.level_descriptors[String(Math.min(3, g.level + 1))]}) evidence: "${g.evidence}"`).join('\n')}`,
  });
  return object.cards.map((c) => ({ ...c, body: c.body }));
}

/** Developmental rewrite for a flagged sentence (Tone Guard suggestion). */
export async function toneRewriteLuna(gw: Gateway, sentence: string, ctx: { orgId: string; observationId: string }) {
  const { object } = await gw.runObject({
    task: 'tone',
    schema: z.object({ rewrite: z.string().min(3).max(400) }),
    promptVersion: V.tone,
    ctx,
    system: `${COMMON}\nRewrite the sentence in developmental, non-judgemental language with the same meaning. Avoid: failed, poor, weak, lacks, unable, should have, wrong, never, always, careless, inadequate, below standard.`,
    prompt: `Sentence: "${sentence}"\nReturn JSON {"rewrite": "..."}`,
  });
  return object.rewrite;
}
