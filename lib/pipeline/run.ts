/**
 * The AI pipeline orchestrator (PRD §8). Storage is injected so the whole flow is unit-testable.
 * Order: transcript → redact → segment → retrieve → tag → contextualise → draft → citations
 *        → tone check → cards → save as "AI draft" (waits for leader approval).
 */
import type { Gateway } from '../ai/gateway';
import { enforceCitations } from './citations';
import { cardsLuna, draftLuna, segmentLuna, tagLuna } from './luna';
import { cardsOffline, draftOffline, tagOffline } from './offline';
import { makeRedactor, type RosterEntry } from './redact';
import { buildIndex, type Retrieved } from './retrieve';
import { segmentOffline, timeline } from './segment';
import { rewrite, toneFlags } from './tone';
import type { CaptureItem, CardDraft, EvidenceUnit, IndicatorDoc, NarrativeContent, PipelineContext, TagDraft } from './types';

export const STEPS = ['transcribe', 'redact', 'segment', 'retrieve', 'tag', 'contextualise', 'draft', 'tone', 'cards', 'save', 'done'] as const;
export type Step = (typeof STEPS)[number];

export type PipelineInput = {
  orgId: string;
  observationId: string;
  items: CaptureItem[];
  roster: RosterEntry[];
  docs: IndicatorDoc[];
  ctx: PipelineContext;
  lastLevels: string;
};

export type PipelineOutput = {
  units: (EvidenceUnit & { id: string })[];
  tags: (TagDraft & { unitId: string })[];
  narrative: NarrativeContent;
  cards: CardDraft[];
  toneFlags: number;
  removedSentences: number;
  mode: 'luna' | 'offline';
};

export type PipelineDeps = {
  gateway: Gateway | null;
  setStep: (s: Step) => Promise<void> | void;
  newId: () => string;
};

export async function runPipeline(input: PipelineInput, deps: PipelineDeps): Promise<PipelineOutput> {
  const gw = deps.gateway;
  const ids = { orgId: input.orgId, observationId: input.observationId };

  // 1 · transcribe — chunk transcripts already stored at capture time; notes are typed/dictated.
  await deps.setStep('transcribe');

  // 2 · redact every piece of text before any model sees it
  await deps.setStep('redact');
  const redact = makeRedactor(input.roster);
  const items = input.items.map((i) => ({ ...i, text: i.text ? redact(i.text) : i.text, transcript: i.transcript ? redact(i.transcript) : i.transcript }));

  // 3 · segment
  await deps.setStep('segment');
  let units: EvidenceUnit[] = segmentOffline(items);
  if (gw && units.length > 0) {
    try {
      const segs = await segmentLuna(gw, timeline(items).map((p) => ({ t: p.t, text: p.text })), ids);
      const offline = units;
      units = segs.map((s, idx) => ({ idx, text: redact(s.text), start_ms: s.start_ms, end_ms: Math.max(s.end_ms, s.start_ms), capture_item_ids: [], starred: false }));
      // carry ★ moments / photos from the offline segmentation by time overlap
      for (const u of units) {
        const near = offline.filter((o) => o.start_ms <= u.end_ms + 15_000 && o.end_ms >= u.start_ms - 15_000);
        u.starred = near.some((o) => o.starred);
        u.capture_item_ids = [...new Set(near.flatMap((o) => o.capture_item_ids))];
      }
    } catch {
      /* keep offline segmentation */
    }
  }
  const withIds = units.map((u) => ({ ...u, id: deps.newId() }));
  const unitIds = new Map(withIds.map((u) => [u.idx, u.id]));

  // 4 · retrieve the 8 most likely indicators per unit
  await deps.setStep('retrieve');
  const docMap = new Map(input.docs.map((d) => [d.code, d]));
  const search = buildIndex(input.docs);
  const shortlists = new Map<number, Retrieved[]>(units.map((u) => [u.idx, search(u.text, { k: 8, boost: input.ctx.focusIndicatorCodes })]));

  // 5 · tag (shortlist only)
  await deps.setStep('tag');
  let tags: TagDraft[] = [];
  let mode: 'luna' | 'offline' = 'offline';
  if (gw) {
    try {
      tags = await tagLuna(gw, units, shortlists, docMap, { ...input.ctx, ...ids });
      mode = 'luna';
    } catch {
      tags = tagOffline(units, (u) => shortlists.get(u.idx) ?? [], docMap);
    }
  } else {
    tags = tagOffline(units, (u) => shortlists.get(u.idx) ?? [], docMap);
  }
  // Final guard: nothing outside the shortlist, ever.
  tags = tags.filter((t) => (shortlists.get(t.unitIdx) ?? []).some((r) => r.code === t.indicator) && docMap.has(t.indicator));

  // 6 · contextualise (focus, goals, last levels are passed into drafting)
  await deps.setStep('contextualise');

  // 7 · draft with citations
  await deps.setStep('draft');
  let narrative: NarrativeContent;
  if (gw && mode === 'luna') {
    try {
      narrative = await draftLuna(
        gw,
        withIds.map((u) => ({ id: u.id, text: u.text })),
        tags.map((t) => ({ ...t, unitId: unitIds.get(t.unitIdx)!, name: docMap.get(t.indicator)!.name })),
        { ...input.ctx, ...ids, lastLevels: input.lastLevels },
      );
    } catch {
      narrative = draftOffline(units, unitIds, tags, docMap, input.ctx);
    }
  } else {
    narrative = draftOffline(units, unitIds, tags, docMap, input.ctx);
  }
  const enforced = enforceCitations(narrative, withIds.map((u) => u.id));
  narrative = enforced.content;
  // goal ids must belong to the educator
  if (narrative.next_step.goal_id && !input.ctx.goals.some((g) => g.id === narrative.next_step.goal_id)) narrative.next_step.goal_id = null;

  // 8 · tone check — auto-apply developmental rewrites; leaders still see what changed in review
  await deps.setStep('tone');
  let flagged = 0;
  const fix = (s: { text: string }) => {
    if (toneFlags(s.text).length) {
      flagged++;
      s.text = rewrite(s.text);
    }
  };
  narrative.glows.forEach(fix);
  narrative.grows.forEach(fix);
  fix(narrative.next_step);

  // 9 · coaching cards, 1–2 per Grow
  await deps.setStep('cards');
  const growTags = tags.filter((t) => t.valence === 'grow' && t.confidence >= 0.55);
  const uniqueGrows = growTags.filter((t, i) => growTags.findIndex((x) => x.indicator === t.indicator) === i);
  let cards: CardDraft[] = [];
  if (gw && mode === 'luna' && uniqueGrows.length) {
    try {
      cards = await cardsLuna(gw, uniqueGrows.slice(0, 2).map((t) => ({ indicator: docMap.get(t.indicator)!, level: t.level, evidence: units.find((u) => u.idx === t.unitIdx)!.text })), { ...input.ctx, ...ids });
    } catch {
      cards = cardsOffline(uniqueGrows, docMap, input.ctx);
    }
  } else {
    cards = cardsOffline(uniqueGrows, docMap, input.ctx);
  }
  cards = cards.filter((c) => docMap.has(c.indicator)).map((c) => ({ ...c, title: rewrite(c.title) }));

  await deps.setStep('save');
  return {
    units: withIds,
    tags: tags.map((t) => ({ ...t, unitId: unitIds.get(t.unitIdx)! })),
    narrative,
    cards,
    toneFlags: flagged,
    removedSentences: enforced.removed,
    mode,
  };
}
