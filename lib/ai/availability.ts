/**
 * AI mode. "luna" when OPENAI_API_KEY is set; otherwise "offline": every AI step uses a
 * deterministic, rule-based fallback so the whole product works end to end without a key.
 * Offline output is clearly labelled in the UI ("Drafted offline — add an AI key for richer drafts").
 */
export type AiMode = 'luna' | 'offline';

export function aiMode(env: Record<string, string | undefined> = process.env): AiMode {
  if (env.AI_FORCE_OFFLINE === '1') return 'offline';
  return env.OPENAI_API_KEY ? 'luna' : 'offline';
}
