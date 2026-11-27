import 'server-only';
import { createOpenAI } from '@ai-sdk/openai';
import { transcribe } from 'ai';

/**
 * Speech-to-text behind one function (PRD §8: provider-agnostic; the Singapore STT bake-off in pilot
 * week 1 swaps the engine here). Live clips use the fast model; the second pass after End uses the
 * more accurate one.
 */
export const STT_MODELS = {
  live: () => process.env.AI_STT_MODEL ?? 'gpt-4o-mini-transcribe',
  final: () => process.env.AI_STT_FINAL_MODEL ?? 'gpt-4o-transcribe',
};

export async function speechToText(audio: Uint8Array, opts: { pass: keyof typeof STT_MODELS; prompt?: string; signal?: AbortSignal }): Promise<string | null> {
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || undefined });
  const res = await transcribe({
    model: openai.transcription(STT_MODELS[opts.pass]()),
    audio,
    abortSignal: opts.signal,
    providerOptions: opts.prompt ? { openai: { prompt: opts.prompt } } : undefined,
  });
  return res.text?.trim() || null;
}
