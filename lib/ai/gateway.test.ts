import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AiOutputError, createGateway, isOutputProblem, type AiRunRecord } from './gateway';
import { costUsd, envKeyFor, MODEL_MAP, modelFor, TASKS } from './models';

const usage = (input = 1000, cached = 200, output = 300) => ({
  inputTokens: { total: input, noCache: input - cached, cacheRead: cached, cacheWrite: 0 },
  outputTokens: { total: output, text: output, reasoning: 0 },
});
const reply = (text: string) => ({
  content: [{ type: 'text' as const, text }],
  finishReason: { unified: 'stop' as const, raw: 'stop' },
  usage: usage(),
  warnings: [],
});

/** A mock model that returns `texts` in order, one per call. */
function scripted(texts: string[]) {
  let i = 0;
  const model = new MockLanguageModelV4({
    provider: 'mock',
    modelId: 'mock',
    doGenerate: async () => reply(texts[Math.min(i++, texts.length - 1)]),
  });
  return model;
}

function setup(model: MockLanguageModelV4, env: Record<string, string> = {}) {
  const runs: AiRunRecord[] = [];
  const resolved: string[] = [];
  let t = 0;
  const gw = createGateway({
    resolveModel: (id) => (resolved.push(id), model),
    logRun: (r) => void runs.push(r),
    region: 'test-region',
    now: () => (t += 10),
    env,
  });
  return { gw, runs, resolved };
}

// A tagger-shaped schema: indicator must come from the shortlist.
const shortlist = ['3.3.4', '3.3.5', '1.1.2'] as const;
const TagSchema = z.object({
  tags: z.array(z.object({
    indicator: z.enum(shortlist),
    level: z.number().int().min(1).max(3),
    valence: z.enum(['glow', 'grow']),
    confidence: z.number().min(0).max(1),
  })).max(3),
});
const call = { task: 'tag' as const, schema: TagSchema, system: 'SYSTEM', prompt: 'PROMPT', promptVersion: 'tag@1', ctx: { orgId: 'org-1', observationId: 'obs-1' } };

describe('model config', () => {
  it('routes every task to GPT-6 Luna by default', () => {
    for (const task of TASKS) expect(MODEL_MAP[task], task).toBe('gpt-6-luna');
    for (const task of TASKS) expect(modelFor(task, {}), task).toBe('gpt-6-luna');
  });

  it('lets one task be overridden by env without touching others', () => {
    const env = { [envKeyFor('feedback.write')]: 'gpt-6-sol' };
    expect(envKeyFor('feedback.write')).toBe('AI_MODEL_FEEDBACK_WRITE');
    expect(modelFor('feedback.write', env)).toBe('gpt-6-sol');
    expect(modelFor('tag', env)).toBe('gpt-6-luna');
  });

  it('prices Luna at $0.10 in / $0.01 cached / $0.50 out per 1M tokens', () => {
    expect(costUsd('gpt-6-luna', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(0.6);
    expect(costUsd('gpt-6-luna', { inputTokens: 1_000_000, cachedInputTokens: 1_000_000 })).toBeCloseTo(0.01);
    expect(costUsd('gpt-6-luna', { inputTokens: 1000, cachedInputTokens: 200, outputTokens: 300 })).toBeCloseTo((800 * 0.1 + 200 * 0.01 + 300 * 0.5) / 1e6);
    expect(costUsd('unknown-model', { inputTokens: 1 })).toBeNull();
  });

  it('matches the PRD usage estimate: well under $0.10 per educator per month on Luna', () => {
    const tagging = costUsd('gpt-6-luna', { inputTokens: 120_000, outputTokens: 15_000 })!;
    const feedback = costUsd('gpt-6-luna', { inputTokens: 60_000, outputTokens: 8_000 })!;
    const coach = costUsd('gpt-6-luna', { inputTokens: 180_000, cachedInputTokens: 150_000, outputTokens: 15_000 })!;
    expect(tagging + feedback + coach).toBeLessThan(0.1);
  });
});

describe('runObject', () => {
  it('returns a validated object, sends the system prompt first, and logs one ok run with cost', async () => {
    const model = scripted([JSON.stringify({ tags: [{ indicator: '3.3.4', level: 2, valence: 'glow', confidence: 0.86 }] })]);
    const { gw, runs, resolved } = setup(model);
    const res = await gw.runObject(call);
    expect(res.object.tags[0]).toEqual({ indicator: '3.3.4', level: 2, valence: 'glow', confidence: 0.86 });
    expect(res.attempts).toBe(1);
    expect(resolved).toEqual(['gpt-6-luna']);
    const prompt = model.doGenerateCalls[0].prompt;
    expect(prompt[0]).toMatchObject({ role: 'system', content: 'SYSTEM' }); // static context first → prompt caching
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      task: 'tag', model: 'gpt-6-luna', provider: 'openai', region: 'test-region', prompt_version: 'tag@1',
      org_id: 'org-1', observation_id: 'obs-1', ok: true, error: null,
      input_tokens: 1000, cached_input_tokens: 200, output_tokens: 300, latency_ms: 10,
    });
    expect(runs[0].cost_usd).toBeCloseTo((800 * 0.1 + 200 * 0.01 + 300 * 0.5) / 1e6);
  });

  it('asks for JSON output from the model (response format = json)', async () => {
    const model = scripted([JSON.stringify({ tags: [] })]);
    const { gw } = setup(model);
    await gw.runObject(call);
    expect(model.doGenerateCalls[0].responseFormat?.type).toBe('json');
  });

  it('repairs once after invalid JSON and logs both attempts', async () => {
    const model = scripted(['not json at all', JSON.stringify({ tags: [] })]);
    const { gw, runs } = setup(model);
    const res = await gw.runObject(call);
    expect(res).toEqual({ object: { tags: [] }, attempts: 2 });
    expect(runs.map((r) => r.ok)).toEqual([false, true]);
    expect(runs[0].error).toBeTruthy();
    // the repair prompt carries the validation error back to the model
    const repairPrompt = JSON.stringify(model.doGenerateCalls[1].prompt);
    expect(repairPrompt).toContain('could not be used');
  });

  it('rejects an indicator that is not on the shortlist (tags only from the official list)', async () => {
    const offList = JSON.stringify({ tags: [{ indicator: '9.9.9', level: 2, valence: 'glow', confidence: 0.9 }] });
    const { gw, runs } = setup(scripted([offList, offList]));
    await expect(gw.runObject(call)).rejects.toBeInstanceOf(AiOutputError);
    expect(runs).toHaveLength(2);
    expect(runs.every((r) => !r.ok)).toBe(true);
  });

  it('rejects out-of-range levels and more than 3 tags', async () => {
    const bad = [
      JSON.stringify({ tags: [{ indicator: '3.3.4', level: 4, valence: 'glow', confidence: 0.9 }] }),
      JSON.stringify({ tags: Array(4).fill({ indicator: '3.3.4', level: 1, valence: 'grow', confidence: 0.9 }) }),
    ];
    for (const b of bad) {
      const { gw } = setup(scripted([b]));
      await expect(gw.runObject({ ...call, maxRepairs: 0 })).rejects.toBeInstanceOf(AiOutputError);
    }
  });

  it('respects maxRepairs = 0 (single attempt)', async () => {
    const { gw, runs } = setup(scripted(['nope', JSON.stringify({ tags: [] })]));
    await expect(gw.runObject({ ...call, maxRepairs: 0 })).rejects.toThrow(/after 1 attempts/);
    expect(runs).toHaveLength(1);
  });

  it('does not spend repair attempts on transport/auth errors — it rethrows immediately', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        const e = new Error('401 Unauthorized: invalid api key');
        e.name = 'AI_APICallError';
        throw e;
      },
    });
    const { gw, runs } = setup(model);
    await expect(gw.runObject(call)).rejects.toThrow(/401/);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ ok: false });
  });

  it('a failing logger never breaks the call', async () => {
    const gw = createGateway({
      resolveModel: () => scripted([JSON.stringify({ tags: [] })]),
      logRun: () => { throw new Error('db down'); },
    });
    await expect(gw.runObject(call)).resolves.toMatchObject({ object: { tags: [] } });
  });

  it('uses the env override model when set', async () => {
    const { gw, resolved, runs } = setup(scripted([JSON.stringify({ tags: [] })]), { AI_MODEL_TAG: 'gpt-6-sol' });
    await gw.runObject(call);
    expect(resolved).toEqual(['gpt-6-sol']);
    expect(runs[0].model).toBe('gpt-6-sol');
  });
});

describe('runStream', () => {
  it('streams text and logs the run on finish', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 't' },
          { type: 'text-delta', id: 't', delta: 'Try a ' },
          { type: 'text-delta', id: 't', delta: '3-second wait.' },
          { type: 'text-end', id: 't' },
          { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: usage(500, 400, 40) },
        ]),
      }),
    });
    const onLog = vi.fn();
    const gw = createGateway({ resolveModel: () => model, logRun: onLog });
    const res = gw.runStream({ task: 'coach', system: 'COACH', messages: [{ role: 'user', content: 'my K1s go quiet' }], promptVersion: 'coach@1' });
    let text = '';
    for await (const chunk of res.textStream) text += chunk;
    expect(text).toBe('Try a 3-second wait.');
    await vi.waitFor(() => expect(onLog).toHaveBeenCalledTimes(1));
    expect(onLog.mock.calls[0][0]).toMatchObject({ task: 'coach', ok: true, input_tokens: 500, cached_input_tokens: 400, output_tokens: 40 });
  });
});

describe('isOutputProblem', () => {
  it('classifies errors correctly', () => {
    const named = (name: string, msg = 'x') => Object.assign(new Error(msg), { name });
    expect(isOutputProblem(named('AI_NoObjectGeneratedError'))).toBe(true);
    expect(isOutputProblem(named('AI_JSONParseError'))).toBe(true);
    expect(isOutputProblem(named('AI_TypeValidationError'))).toBe(true);
    expect(isOutputProblem(named('AI_APICallError', '500 server error'))).toBe(false);
    expect(isOutputProblem('string')).toBe(false);
  });
});
