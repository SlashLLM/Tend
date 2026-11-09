/**
 * Debrief Mode agenda (PRD M4.18): one celebration, two open questions drawn from the
 * educator's own reflection, one decision. Questions, not verdicts. Offline + deterministic.
 */
export type Agenda = { celebrate: string; questions: string[]; decision: string };

const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function buildAgenda(input: {
  glows: string[];
  grows: string[];
  nextStep: string;
  reflection: string | null;
  contexts: string[];
}): Agenda {
  const celebrate = input.glows[0] ? `Celebrate: ${clip(input.glows[0])}` : 'Celebrate one thing that went well today.';
  const qs: string[] = [];
  if (input.reflection?.trim()) qs.push(`You said: “${clip(input.reflection.trim(), 110)}” — what made you notice that?`);
  if (input.contexts[0]) qs.push(`You added: “${clip(input.contexts[0], 90)}” — how should we take that into account?`);
  if (input.grows[0]) qs.push(`What would help you with this next: ${clip(input.grows[0].replace(/^An opportunity to grow[^:]*:\s*/i, ''), 110)}?`);
  qs.push('What would you like to try first, and how will we know it is working?');
  return { celebrate, questions: qs.slice(0, 2), decision: input.nextStep ? `Agree one step: ${clip(input.nextStep)}` : 'Agree one small step to try this week.' };
}
