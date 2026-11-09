/**
 * Day-1 live check (plan §15 item 2): confirms the GPT-6 Luna model id works and
 * returns schema-valid JSON. Run: OPENAI_API_KEY=... pnpm ai:smoke
 */
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { createGateway, type AiRunRecord } from '../lib/ai/gateway';

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not set — skipping live smoke test.');
    process.exit(2);
  }
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || undefined });
  const runs: AiRunRecord[] = [];
  const gw = createGateway({ resolveModel: (id) => openai(id), logRun: (r) => void runs.push(r), region: process.env.AI_REGION ?? 'unconfirmed' });
  const schema = z.object({
    tags: z.array(z.object({ indicator: z.enum(['3.3.4', '3.3.5', '1.1.2']), level: z.number().int().min(1).max(3), valence: z.enum(['glow', 'grow']), confidence: z.number().min(0).max(1), reason: z.string() })).max(3),
  });
  const { object } = await gw.runObject({
    task: 'tag',
    schema,
    promptVersion: 'smoke@1',
    system: 'You tag preschool classroom evidence to teaching indicators. Use ONLY indicators from the shortlist. Return JSON.',
    prompt: 'Shortlist: 3.3.4 Extending Thinking Through Questioning; 3.3.5 Providing Support to Deepen Thinking; 1.1.2 Facilitating Responsive Interactions.\nEvidence: "Teacher asked: why do you think the bear hid? and waited about 4 seconds; Child A answered."',
  });
  console.log(JSON.stringify(object, null, 2));
  console.table(runs.map((r) => ({ model: r.model, ok: r.ok, in: r.input_tokens, out: r.output_tokens, usd: r.cost_usd, ms: r.latency_ms })));
}

main().catch((e) => {
  console.error('SMOKE FAILED:', e);
  process.exit(1);
});
