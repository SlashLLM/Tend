import 'server-only';
import { createOpenAI } from '@ai-sdk/openai';
import { createGateway, type AiRunRecord, type Gateway } from './gateway';

let cached: Gateway | null = null;

/**
 * Production gateway: OpenAI provider (GPT-6 Luna by default).
 * OPENAI_BASE_URL lets us point at an in-region deployment (e.g. Azure / Bedrock-compatible proxy)
 * once Singapore residency is confirmed (PRD Q4). AI_REGION is recorded on every ai_run row.
 */
export function getGateway(logRun?: (r: AiRunRecord) => Promise<void> | void): Gateway {
  if (cached && !logRun) return cached;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set — AI features are unavailable');
  const openai = createOpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL || undefined });
  const gw = createGateway({
    resolveModel: (id) => openai(id),
    logRun,
    provider: 'openai',
    region: process.env.AI_REGION ?? 'unconfirmed',
  });
  if (!logRun) cached = gw;
  return gw;
}
