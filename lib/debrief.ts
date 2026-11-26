/**
 * Debrief Mode agenda (PRD M4.18): one celebration, two open questions drawn from the
 * educator's own reflection, one decision. Questions, not verdicts. Offline + deterministic.
 */
export type Agenda = { celebrate: string; questions: string[]; decision: string };

const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Agenda sentences; English by default, the UI passes translated ones. */
export type AgendaPhrases = {
  celebrate: (glow: string) => string;
  celebrateDefault: string;
  youSaid: (reflection: string) => string;
  youAdded: (context: string) => string;
  whatWouldHelp: (grow: string) => string;
  tryFirst: string;
  agree: (step: string) => string;
  agreeDefault: string;
};

export const AGENDA_EN: AgendaPhrases = {
  celebrate: (g) => `Celebrate: ${g}`,
  celebrateDefault: 'Celebrate one thing that went well today.',
  youSaid: (r) => `You said: “${r}” — what made you notice that?`,
  youAdded: (c) => `You added: “${c}” — how should we take that into account?`,
  whatWouldHelp: (g) => `What would help you with this next: ${g}?`,
  tryFirst: 'What would you like to try first, and how will we know it is working?',
  agree: (s) => `Agree one step: ${s}`,
  agreeDefault: 'Agree one small step to try this week.',
};

export function buildAgenda(
  input: {
    glows: string[];
    grows: string[];
    nextStep: string;
    reflection: string | null;
    contexts: string[];
  },
  P: AgendaPhrases = AGENDA_EN,
): Agenda {
  const celebrate = input.glows[0] ? P.celebrate(clip(input.glows[0])) : P.celebrateDefault;
  const qs: string[] = [];
  if (input.reflection?.trim()) qs.push(P.youSaid(clip(input.reflection.trim(), 110)));
  if (input.contexts[0]) qs.push(P.youAdded(clip(input.contexts[0], 90)));
  if (input.grows[0]) qs.push(P.whatWouldHelp(clip(input.grows[0].replace(/^An opportunity to grow[^:]*:\s*/i, ''), 110)));
  qs.push(P.tryFirst);
  return { celebrate, questions: qs.slice(0, 2), decision: input.nextStep ? P.agree(clip(input.nextStep)) : P.agreeDefault };
}
