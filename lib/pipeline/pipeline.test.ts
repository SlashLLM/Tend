import { MockLanguageModelV4 } from 'ai/test';
import { beforeEach, describe, expect, it } from 'vitest';
import { createGateway, type AiRunRecord } from '../ai/gateway';
import { flatIndicators } from '../../supabase/seed/registry';
import { editRatio, levenshtein, wer } from '../text/edit';
import { enforceCitations, MAX_WORDS, narrativeText, words } from './citations';
import { DEMO_DICTATION } from './demo-script';
import { cardsOffline, levelFromCues, tagOffline, valenceFromCues } from './offline';
import { leaksName, makeRedactor } from './redact';
import { buildIndex, stem, tokenize } from './retrieve';
import { runPipeline, STEPS, type PipelineInput, type Step } from './run';
import { segmentOffline } from './segment';
import { hasToneIssue, rewrite, TONE_WORDS, toneFlags } from './tone';
import type { CaptureItem, IndicatorDoc, NarrativeContent } from './types';

const DOCS: IndicatorDoc[] = flatIndicators().map((i) => ({
  id: `id-${i.code}`, code: i.code, name: i.name, subdomain_code: i.subdomain_code, subdomain_name: i.subdomain_name, level_descriptors: i.levels, look_fors: i.look_fors,
}));
const DOCMAP = new Map(DOCS.map((d) => [d.code, d]));
const ROSTER = [{ child_name: 'Wei Ling' }, { child_name: 'Arjun', aliases: ['AJ'] }, { child_name: 'Wei' }];

let n = 0;
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function demoItems(): CaptureItem[] {
  const items: CaptureItem[] = [];
  DEMO_DICTATION.forEach((d, i) => {
    items.push({ id: `note-${i}`, kind: 'note', t_offset_ms: d.t, text: d.text, transcript: null });
    if (d.moment) items.push({ id: `moment-${i}`, kind: 'moment', t_offset_ms: d.t + 2000, text: null, transcript: null });
  });
  items.push({ id: 'photo-1', kind: 'photo', t_offset_ms: 45_000, text: null, transcript: null });
  return items;
}

const CTX = {
  focusIndicatorCodes: ['3.3.4'],
  goals: [{ id: 'goal-334', code: '3.3.4', current_level: 1, target_level: 2 }, { id: 'goal-342', code: '3.4.2', current_level: 1, target_level: 2 }],
  educatorFirstName: 'Aisha', classLevel: 'K1', locale: 'en',
};

// ─────────────────────────────────────────────────────────────

describe('redact', () => {
  let redact = makeRedactor(ROSTER);
  beforeEach(() => { redact = makeRedactor(ROSTER); }); // one redactor per observation
  it('replaces roster names with stable Child letters (longest name first, case-insensitive)', () => {
    expect(redact('Wei Ling smiled at Arjun. Then wei ling laughed and AJ waved; Wei joined.')).toBe('Child A smiled at Child B. Then Child A laughed and Child B waved; Child C joined.');
  });
  it('keeps possessives and does not touch substrings of other words', () => {
    expect(redact("Arjun's turn. Arjunah and Weird things stay.")).toBe("Child A's turn. Arjunah and Weird things stay.");
  });
  it('removes NRIC/FIN, Singapore phone numbers and emails', () => {
    expect(redact('Call 9123 4567 or +65 6123-4567, NRIC S1234567D, mail a.b@x.sg')).toBe('Call [phone removed] or [phone removed], NRIC [ID removed], mail [email removed]');
  });
  it('leaksName detects survivors', () => {
    expect(leaksName('Child A and Arjun', ROSTER)).toBe(true);
    expect(leaksName(redact('Child A and Arjun'), ROSTER)).toBe(false);
  });
});

describe('segment', () => {
  it('builds evidence units with timestamps, ★ moments and nearby photos', () => {
    const units = segmentOffline(demoItems());
    expect(units.length).toBeGreaterThanOrEqual(4);
    expect(units.every((u, i) => u.idx === i && u.text.length > 0 && u.end_ms >= u.start_ms)).toBe(true);
    expect(units.some((u) => u.starred)).toBe(true);
    expect(units.some((u) => u.capture_item_ids.includes('photo-1'))).toBe(true);
    const all = units.map((u) => u.text).join(' ');
    for (const d of DEMO_DICTATION) expect(all).toContain(d.text.split(' ').slice(0, 4).join(' ')); // nothing lost
  });
  it('a ★ moment starts a new unit', () => {
    const items: CaptureItem[] = [
      { id: 'a', kind: 'note', t_offset_ms: 1000, text: 'First thing.', transcript: null },
      { id: 'm', kind: 'moment', t_offset_ms: 1500, text: null, transcript: null },
      { id: 'b', kind: 'note', t_offset_ms: 2000, text: 'Second thing.', transcript: null },
    ];
    expect(segmentOffline(items).map((u) => u.text)).toEqual(['First thing.', 'Second thing.']);
  });
  it('empty capture → no units', () => expect(segmentOffline([])).toEqual([]));
});

describe('retrieve (offline BM25)', () => {
  const search = buildIndex(DOCS);
  const top3 = (q: string) => search(q, { k: 3 }).map((r) => r.code);
  it.each([
    ['She asks why do you think the bear is hiding and waits for answers', '3.3.4'],
    ['Children took turns waiting for the swing using a stop go game', '3.4.2'],
    ['She named the feeling: you look frustrated, and helped him calm down with breaths', '2.2'],
    ['Invited a child to share how her family celebrates Hari Raya and other cultures', '2.1.3'],
    ['Greets each child warmly by name at the door', '1.1.1'],
    ['Pointed to the word cave in the book and children repeated the print', '3.3.2'],
  ])('%s → %s in the top 3', (q, expected) => {
    expect(top3(q).some((c) => c.startsWith(expected))).toBe(true);
  });
  it('focus boost lifts the chosen indicator', () => {
    const q = 'She asks a question and the children answer';
    const plain = search(q, { k: 8 }).findIndex((r) => r.code === '3.3.4');
    const boosted = search(q, { k: 8, boost: ['3.3.4'] }).findIndex((r) => r.code === '3.3.4');
    expect(boosted).toBeGreaterThanOrEqual(0);
    expect(boosted).toBeLessThanOrEqual(plain === -1 ? 8 : plain);
  });
  it('returns at most k results, only positive scores, sorted', () => {
    const r = search('questions waiting feelings play', { k: 8 });
    expect(r.length).toBeLessThanOrEqual(8);
    expect(r.every((x, i) => x.score > 0 && (i === 0 || r[i - 1].score >= x.score))).toBe(true);
    expect(search('zzz qqq', { k: 8 })).toEqual([]);
  });
  it('tokenizer drops stop words and stems', () => {
    expect(tokenize('The children were questioning')).toEqual(['question']);
    expect(stem('stories')).toBe('story');
  });
});

describe('offline tagging cues', () => {
  it.each([
    ['asked what animal this is', 1],
    ['asked why do you think the bear is hiding and waited', 2],
    ['followed up with what makes you think that and invited others to respond', 3],
  ])('"%s" → level %d', (t, l) => expect(levelFromCues(t)).toBe(l));
  it.each([
    ['Arjun raises his hand with an idea but the page is turned before he can share.', 'grow'],
    ['Aisha says good answer and moves on to the next page.', 'grow'],
    ['Two children answer; most of the group goes quiet.', 'grow'],
    ['She invites a quiet child to finish the sentence.', 'glow'],
    ['She greets the children warmly by name.', 'glow'],
  ])('valence regression: "%s" → %s', (text, v) => expect(valenceFromCues(text, 1)).toBe(v));
  it('grow when there is a missed opportunity', () => {
    expect(valenceFromCues('the page is turned before he can share; most of the group goes quiet', 2)).toBe('grow');
    expect(valenceFromCues('asks why and waits four seconds', 2)).toBe('glow');
  });
});

describe('tone guard', () => {
  it('flags every PRD tone word', () => {
    for (const w of TONE_WORDS) expect(hasToneIssue(`Aisha ${w} the thing`), w).toBe(true);
  });
  it('rewrites "Aisha failed to…" into "An opportunity…"-style wording', () => {
    expect(rewrite('Aisha failed to wait for answers.')).toBe('Aisha has an opportunity to wait for answers.');
    expect(hasToneIssue(rewrite('She should have waited. Her questioning was poor and she never paused.'))).toBe(false);
  });
  it('does not flag clean developmental text', () => {
    expect(toneFlags('An opportunity to build on a child’s answer.')).toEqual([]);
  });
});

describe('citations', () => {
  const draft = (): NarrativeContent => ({
    glows: [
      { text: 'Cited glow.', evidence_ids: ['e1'] },
      { text: 'Uncited glow.', evidence_ids: [] },
      { text: 'Bogus citation.', evidence_ids: ['nope'] },
      { text: 'Your questioning score was 2.3/3.', evidence_ids: ['e1'] },
      { text: 'Glow 3.', evidence_ids: ['e2'] },
      { text: 'Glow 4.', evidence_ids: ['e2'] },
    ],
    grows: [{ text: 'Grow 1.', evidence_ids: ['e2'] }, { text: 'Grow 2.', evidence_ids: ['e1'] }, { text: 'Grow 3.', evidence_ids: ['e1'] }],
    next_step: { text: 'Next.', evidence_ids: ['x'], goal_id: 'g' },
  });
  it('removes uncited, mis-cited and score sentences; caps glows at 3 and grows at 2', () => {
    const { content, removed } = enforceCitations(draft(), ['e1', 'e2']);
    expect(content.glows.map((s) => s.text)).toEqual(['Cited glow.', 'Glow 3.', 'Glow 4.']);
    expect(content.grows).toHaveLength(2);
    expect(removed).toBeGreaterThan(0);
  });
  it('always keeps one owned next step, re-anchored to valid evidence', () => {
    const { content } = enforceCitations(draft(), ['e1', 'e2']);
    expect(content.next_step.text).toBe('Next.');
    expect(content.next_step.evidence_ids.every((id) => ['e1', 'e2'].includes(id))).toBe(true);
  });
  it('enforces the 220-word cap', () => {
    const long = 'word '.repeat(70).trim();
    const d: NarrativeContent = { glows: [1, 2, 3].map(() => ({ text: long, evidence_ids: ['e1'] })), grows: [1, 2].map(() => ({ text: long, evidence_ids: ['e1'] })), next_step: { text: 'Do it.', evidence_ids: ['e1'], goal_id: null } };
    const { content } = enforceCitations(d, ['e1']);
    expect(words(narrativeText(content))).toBeLessThanOrEqual(MAX_WORDS);
    expect(content.glows.length).toBeGreaterThanOrEqual(1);
    expect(content.grows.length).toBeGreaterThanOrEqual(1);
  });
});

describe('edit distance & WER', () => {
  it('levenshtein basics', () => {
    expect(levenshtein([...'kitten'], [...'sitting'])).toBe(3);
    expect(levenshtein([], [...'abc'])).toBe(3);
  });
  it('editRatio: 0 untouched, small for light edits, 1 for full rewrite', () => {
    expect(editRatio('same text', 'same text')).toBe(0);
    expect(editRatio('You asked an open why-question.', 'You asked an open why question.')).toBeLessThan(0.15);
    expect(editRatio('abc', 'xyz')).toBe(1);
    expect(editRatio('', '')).toBe(0);
  });
  it('WER on words, case and punctuation insensitive', () => {
    expect(wer('Why do you think the bear is hiding', 'why do you think the bear is hiding?')).toBe(0);
    expect(wer('why do you think the bare is hiding', 'why do you think the bear is hiding')).toBeCloseTo(0.125);
    expect(wer('', '')).toBe(0);
  });
});

describe('runPipeline · offline on the demo script', () => {
  const input = (): PipelineInput => ({ orgId: 'org', observationId: 'obs', items: demoItems(), roster: ROSTER, docs: DOCS, ctx: CTX, lastLevels: '3.3.4: L1' });

  it('runs every step in order and produces a cited, redacted, tone-clean draft', async () => {
    const steps: Step[] = [];
    const out = await runPipeline(input(), { gateway: null, setStep: (s) => void steps.push(s), newId });
    expect(steps).toEqual(STEPS.slice(0, -1));
    expect(out.mode).toBe('offline');
    // redaction
    const allText = JSON.stringify(out);
    expect(leaksName(allText, ROSTER)).toBe(false);
    expect(allText).toContain('Child A');
    // tags only from the official list
    expect(out.tags.length).toBeGreaterThan(0);
    expect(out.tags.every((t) => DOCMAP.has(t.indicator))).toBe(true);
    expect(out.tags.some((t) => t.indicator === '3.3.4')).toBe(true);
    // every sentence cites real units
    const unitIds = new Set(out.units.map((u) => u.id));
    for (const s of [...out.narrative.glows, ...out.narrative.grows, out.narrative.next_step]) {
      expect(s.evidence_ids.length).toBeGreaterThan(0);
      for (const id of s.evidence_ids) expect(unitIds.has(id)).toBe(true);
      expect(hasToneIssue(s.text)).toBe(false);
    }
    expect(out.narrative.glows.length).toBeGreaterThanOrEqual(1);
    expect(out.narrative.glows.length).toBeLessThanOrEqual(3);
    expect(out.narrative.grows.length).toBeLessThanOrEqual(2);
    expect(out.narrative.next_step.text.length).toBeGreaterThan(0);
    expect(words(narrativeText(out.narrative))).toBeLessThanOrEqual(MAX_WORDS);
    // the next step links to Aisha's focus goal when there is a Grow on it
    if (out.tags.some((t) => t.indicator === '3.3.4' && t.valence === 'grow' && t.confidence >= 0.55)) expect(out.narrative.next_step.goal_id).toBe('goal-334');
    // cards: ≤ 2, under 150 words, real indicators
    expect(out.cards.length).toBeLessThanOrEqual(2);
    for (const c of out.cards) {
      expect(DOCMAP.has(c.indicator)).toBe(true);
      expect(words(Object.values(c.body).join(' ') + ' ' + c.title)).toBeLessThan(150);
    }
  });

  it('handles an empty capture gracefully', async () => {
    const out = await runPipeline({ ...input(), items: [] }, { gateway: null, setStep: () => {}, newId });
    expect(out.units).toEqual([]);
    expect(out.tags).toEqual([]);
    expect(out.narrative.glows).toEqual([]);
  });

  it('offline cards adapt to younger classes', () => {
    const cards = cardsOffline([{ unitIdx: 0, indicator: '3.3.4', level: 1, valence: 'grow', confidence: 0.8, reason: '' }], DOCMAP, { ...CTX, classLevel: 'N1' });
    expect(cards[0].body.adapt_by_age).toMatch(/younger/);
  });

  it('offline tagger never tags below the retrieval threshold', () => {
    expect(tagOffline([{ idx: 0, text: 'zzz', start_ms: 0, end_ms: 1, capture_item_ids: [], starred: false }], () => [], DOCMAP)).toEqual([]);
  });
});

describe('runPipeline · with GPT-6 Luna (mocked)', () => {
  /** Mock returns: segment, tag (incl. an OFF-LIST indicator), draft (incl. an uncited + a judgemental sentence), cards. */
  function lunaMock(unitCount: number) {
    const replies: ((prompt: string) => string)[] = [
      () => JSON.stringify({ units: DEMO_DICTATION.slice(0, unitCount).map((d) => ({ text: d.text, start_ms: d.t, end_ms: d.t + 10_000 })) }),
      (prompt) => {
        // parse shortlists per unit from the prompt
        const lists = new Map<number, string[]>();
        for (const block of prompt.split(/UNIT /).slice(1)) {
          const idx = Number(block.match(/^(\d+)/)![1]);
          lists.set(idx, [...block.matchAll(/^\s*- (\d\.\d\.\d) /gm)].map((m) => m[1]));
        }
        const pickIn = (idx: number, pref: string) => (lists.get(idx)!.includes(pref) ? pref : lists.get(idx)![0]);
        // an indicator that is on SOME unit's shortlist but not unit 3's → must be dropped
        const offList = [...lists.entries()].flatMap(([i, l]) => (i === 3 ? [] : l)).find((c) => !lists.get(3)!.includes(c))!;
        (globalThis as { __offList?: string }).__offList = offList;
        const reply = ({ units: [
          { idx: 2, tags: [{ indicator: pickIn(2, '3.3.4'), level: 2, valence: 'glow', confidence: 0.88, reason: 'why question + wait' }] },
          { idx: 3, tags: [{ indicator: pickIn(3, '3.3.4'), level: 1, valence: 'grow', confidence: 0.81, reason: 'moved on' }, { indicator: offList, level: 3, valence: 'glow', confidence: 0.9, reason: 'off-list for this unit' }] },
        ] });
        (globalThis as { __tagReply?: unknown }).__tagReply = { reply, lists: [...lists.entries()] };
        return JSON.stringify(reply);
      },
      (prompt) => {
        const ids = [...prompt.matchAll(/^([0-9a-f-]{36}):/gm)].map((m) => m[1]);
        return JSON.stringify({
          glows: [{ text: 'You asked an open why-question and waited.', evidence_ids: [ids[2]] }, { text: 'Uncited praise.', evidence_ids: ['made-up'] }],
          grows: [{ text: 'Aisha failed to build on Child A’s answer.', evidence_ids: [ids[3]] }],
          next_step: { text: 'Try one follow-up question at story time.', evidence_ids: [ids[3]], goal_id: 'goal-334' },
        });
      },
      (prompt) => JSON.stringify({ cards: [{ indicator: prompt.match(/\n(\d\.\d\.\d) /)![1], title: '3 question stems that stretch thinking', body: { why: 'w', try_tomorrow: 't', say_it: 's', adapt_by_age: 'a', reflect_after: 'r' } }] }),
    ];
    let i = 0;
    return new MockLanguageModelV4({
      doGenerate: async (opts) => {
        const prompt = JSON.stringify(opts.prompt).replace(/\\n/g, '\n');
        const text = replies[Math.min(i++, replies.length - 1)](prompt);
        return { content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 50, text: 50, reasoning: 0 } }, warnings: [] };
      },
    });
  }

  it('uses Luna, drops off-list tags and uncited sentences, rewrites judgemental wording, logs every call', async () => {
    const runs: AiRunRecord[] = [];
    const model = lunaMock(5); // one model instance across all steps
    const gw = createGateway({ resolveModel: () => model, logRun: (r) => void runs.push(r) });
    const out = await runPipeline(
      { orgId: 'org', observationId: 'obs', items: demoItems(), roster: ROSTER, docs: DOCS, ctx: CTX, lastLevels: '' },
      { gateway: gw, setStep: () => {}, newId },
    );
    expect(out.mode).toBe('luna');
    expect(runs.map((r) => r.task), JSON.stringify(runs.map((r) => r.error))).toEqual(['segment', 'tag', 'feedback.write', 'cards']);
    expect(runs.every((r) => r.model === 'gpt-6-luna' && r.ok)).toBe(true);
    expect(leaksName(JSON.stringify(out.units), ROSTER)).toBe(false); // Luna output re-redacted
    const offList = (globalThis as { __offList?: string }).__offList!;
    expect(offList).toBeTruthy();
    expect(out.tags.filter((t) => t.unitIdx === 3).map((t) => t.indicator)).not.toContain(offList);
    expect(out.tags.filter((t) => t.unitIdx === 3)).toHaveLength(1);
    expect(out.narrative.glows.map((g) => g.text)).toEqual(['You asked an open why-question and waited.']);
    expect(out.narrative.grows[0].text).toBe('Aisha has an opportunity to build on Child A’s answer.');
    expect(out.toneFlags).toBe(1);
    expect(out.narrative.next_step.goal_id).toBe('goal-334');
    expect(out.cards[0]?.title ?? '3 question stems that stretch thinking').toBe('3 question stems that stretch thinking');
  });

  it('falls back to offline steps if Luna keeps returning invalid output', async () => {
    const broken = new MockLanguageModelV4({
      doGenerate: async () => ({ content: [{ type: 'text', text: 'not json' }], finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }, warnings: [] }),
    });
    const gw = createGateway({ resolveModel: () => broken });
    const out = await runPipeline({ orgId: 'o', observationId: 'x', items: demoItems(), roster: ROSTER, docs: DOCS, ctx: CTX, lastLevels: '' }, { gateway: gw, setStep: () => {}, newId });
    expect(out.mode).toBe('offline');
    expect(out.narrative.glows.length).toBeGreaterThan(0);
  });
});
