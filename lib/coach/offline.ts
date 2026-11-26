/**
 * Offline coach (no AI key): retrieval over the educator's OWN goals, approved notes and
 * coaching cards. Warm, practical, ≤ 120 words, at most one reflective question, with citations.
 */
import { buildIndex } from '../pipeline/retrieve';
import { postFilter } from './guard';
import type { IndicatorDoc } from '../pipeline/types';
import type { Locale } from '@/i18n/routing';
import { COACH_PHRASES } from './phrases';

export type CoachContext = {
  firstName: string;
  goals: { id: string; doc: IndicatorDoc; current_level: number | null; target_level: number }[];
  cards: { title: string; try_tomorrow: string; say_it: string; indicator: string | null }[];
  lastNextStep: string | null;
};

export type CoachReply = { text: string; citations: { kind: 'goal' | 'card' | 'notes'; ref: string; label: string }[] };

export function offlineCoach(question: string, ctx: CoachContext, goalHint?: string | null, locale: Locale = 'en'): CoachReply {
  const P = COACH_PHRASES[locale];
  const docs = ctx.goals.map((g) => g.doc);
  let goal = ctx.goals.find((g) => g.id === goalHint) ?? null;
  if (!goal && docs.length) {
    const hit = buildIndex(docs)(question, { k: 1 })[0];
    goal = ctx.goals.find((g) => g.doc.code === hit?.code) ?? ctx.goals[0];
  }
  const citations: CoachReply['citations'] = [];
  const parts: string[] = [];
  parts.push(empathy(question, P));
  if (goal) {
    const aim = Math.min(3, Math.max(goal.current_level ?? 1, 1) + 1);
    const step = goal.doc.level_descriptors[String(aim)] ?? goal.doc.look_fors[0];
    parts.push(P.tryThis(goal.doc.code, goal.doc.name, lower(step)));
    const look = goal.doc.look_fors.find((l) => !step.toLowerCase().includes(l.toLowerCase().slice(0, 12)));
    if (look) parts.push(P.signal(lower(look)));
    citations.push({ kind: 'goal', ref: goal.id, label: goal.doc.code });
  }
  const card = ctx.cards.find((c) => c.indicator && c.indicator === goal?.doc.code) ?? ctx.cards[0];
  if (card) {
    parts.push(P.card(card.title, card.say_it));
    citations.push({ kind: 'card', ref: card.title, label: 'card' });
  } else if (ctx.lastNextStep) {
    parts.push(P.lastStep(ctx.lastNextStep.replace(/^Next step:\s*/i, '')));
    citations.push({ kind: 'notes', ref: 'latest', label: 'notes' });
  }
  // End with one reflective question; quoted phrases become statements so there is only one question.
  const body = parts.join(' ').replace(/\s+/g, ' ').replace(/\?(”|")/g, '.$1');
  const text = postFilter(`${body} ${P.closing}`, (x) => x);
  return { text: capWords(text, 120), citations };
}

function empathy(q: string, P: (typeof COACH_PHRASES)[Locale]) {
  if (/\bquiet|silent|shy|don['’]?t (talk|answer)\b/i.test(q)) return P.empathyQuiet;
  if (/\b(behaviou?r|push|hit|fight|calm)\b/i.test(q)) return P.empathyBehaviour;
  if (/\b(time|busy|rush)\b/i.test(q)) return P.empathyTime;
  return P.empathyDefault;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
function capWords(s: string, n: number) {
  const w = s.split(/\s+/);
  return w.length <= n ? s : `${w.slice(0, n).join(' ')}…`;
}
