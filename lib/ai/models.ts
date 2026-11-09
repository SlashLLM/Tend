/**
 * Which model runs which task, and what it costs.
 * GPT-6 Luna for everything (low cost). To move one task to a stronger model
 * (e.g. if the golden set fails on Day 4), change one line here or set
 * AI_MODEL_<TASK> in the environment (e.g. AI_MODEL_FEEDBACK_WRITE=gpt-6-sol).
 */
export const TASKS = [
  'segment', 'tag', 'tone', 'feedback.write', 'cards', 'coach', 'coach.guard', 'digest', 'agenda', 'lna.snapshot', 'help',
] as const;
export type Task = (typeof TASKS)[number];

export const DEFAULT_MODEL = 'gpt-6-luna';

export const MODEL_MAP: Record<Task, string> = {
  segment: DEFAULT_MODEL,
  tag: DEFAULT_MODEL,
  tone: DEFAULT_MODEL,
  'feedback.write': DEFAULT_MODEL, // fallback if the quality gate fails: 'gpt-6-sol'
  cards: DEFAULT_MODEL,
  coach: DEFAULT_MODEL,
  'coach.guard': DEFAULT_MODEL,
  digest: DEFAULT_MODEL,
  agenda: DEFAULT_MODEL,
  'lna.snapshot': DEFAULT_MODEL,
  help: DEFAULT_MODEL,
};

/** US$ per 1M tokens (standard tier, third-party reported Nov 2026 — verify on OpenAI's pricing page). */
export const PRICES: Record<string, { input: number; cachedInput: number; output: number }> = {
  'gpt-6-luna': { input: 0.1, cachedInput: 0.01, output: 0.5 },
  'gpt-6-sol': { input: 2, cachedInput: 0.2, output: 10 },
};

export function envKeyFor(task: Task) {
  return `AI_MODEL_${task.replace(/\W/g, '_').toUpperCase()}`;
}

export function modelFor(task: Task, env: Record<string, string | undefined> = process.env): string {
  return env[envKeyFor(task)] || MODEL_MAP[task];
}

export type Usage = { inputTokens?: number; cachedInputTokens?: number; outputTokens?: number };

export function costUsd(model: string, u: Usage): number | null {
  const p = PRICES[model];
  if (!p) return null;
  const cached = u.cachedInputTokens ?? 0;
  const uncached = Math.max(0, (u.inputTokens ?? 0) - cached);
  return (uncached * p.input + cached * p.cachedInput + (u.outputTokens ?? 0) * p.output) / 1_000_000;
}
