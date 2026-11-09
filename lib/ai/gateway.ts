/**
 * The single AI gateway. Every model call in Tend goes through here so that:
 *  - the model per task is configured in one place (models.ts),
 *  - structured outputs are schema-validated (zod) with one repair retry,
 *  - every call is logged to ai_run (provider, model, region, prompt version, tokens, cost, latency).
 */
import { generateText, Output, streamText, type LanguageModel, type ModelMessage } from 'ai';
import type { z } from 'zod';
import { costUsd, modelFor, type Task, type Usage } from './models';

export type AiRunRecord = {
  task: Task;
  provider: string;
  model: string;
  region: string | null;
  prompt_version: string;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  latency_ms: number;
  org_id: string | null;
  observation_id: string | null;
  ok: boolean;
  error: string | null;
};

export type GatewayDeps = {
  resolveModel: (modelId: string) => LanguageModel;
  logRun?: (run: AiRunRecord) => Promise<void> | void;
  provider?: string;
  region?: string | null;
  now?: () => number;
  env?: Record<string, string | undefined>;
};

export type CallContext = { orgId?: string | null; observationId?: string | null };

export type ObjectCall<S extends z.ZodType> = {
  task: Task;
  schema: S;
  system: string;
  prompt: string;
  promptVersion: string;
  ctx?: CallContext;
  maxRepairs?: number;
  temperature?: number;
};

export class AiOutputError extends Error {
  constructor(message: string, readonly attempts: number) {
    super(message);
    this.name = 'AiOutputError';
  }
}

type SdkUsage = { inputTokens?: number; outputTokens?: number; inputTokenDetails?: { cacheReadTokens?: number } } | undefined;

function usageOf(u: SdkUsage): Usage {
  return { inputTokens: u?.inputTokens, cachedInputTokens: u?.inputTokenDetails?.cacheReadTokens, outputTokens: u?.outputTokens };
}

export function createGateway(deps: GatewayDeps) {
  const now = deps.now ?? (() => Date.now());
  const provider = deps.provider ?? 'openai';
  const region = deps.region ?? null;

  async function log(r: { task: Task; model: string; promptVersion: string; started: number; ctx?: CallContext; ok: boolean; error?: string | null; usage: Usage }) {
    try {
      await deps.logRun?.({
        task: r.task,
        provider,
        model: r.model,
        region,
        prompt_version: r.promptVersion,
        input_tokens: r.usage.inputTokens ?? null,
        cached_input_tokens: r.usage.cachedInputTokens ?? null,
        output_tokens: r.usage.outputTokens ?? null,
        cost_usd: costUsd(r.model, r.usage),
        latency_ms: now() - r.started,
        org_id: r.ctx?.orgId ?? null,
        observation_id: r.ctx?.observationId ?? null,
        ok: r.ok,
        error: r.error ? r.error.slice(0, 1000) : null,
      });
    } catch {
      // Telemetry must never break a user-facing call.
    }
  }

  /** Structured JSON output, validated by `schema`. Retries with the validation error (repair). */
  async function runObject<S extends z.ZodType>(call: ObjectCall<S>): Promise<{ object: z.infer<S>; attempts: number }> {
    const modelId = modelFor(call.task, deps.env ?? process.env);
    const model = deps.resolveModel(modelId);
    const maxRepairs = call.maxRepairs ?? 1;
    let lastError = '';
    for (let attempt = 0; attempt <= maxRepairs; attempt++) {
      const started = now();
      const prompt =
        attempt === 0
          ? call.prompt
          : `${call.prompt}\n\nYour previous reply could not be used: ${lastError.slice(0, 500)}\nReply again with ONLY valid JSON that matches the schema exactly.`;
      try {
        const res = await generateText({
          model,
          system: call.system,
          prompt,
          output: Output.object({ schema: call.schema }),
          temperature: call.temperature,
          maxRetries: 2, // transport-level retries
        });
        // Defence in depth: validate again ourselves.
        const parsed = call.schema.safeParse(res.output);
        if (!parsed.success) throw new SchemaMismatch(parsed.error.message);
        await log({ task: call.task, model: modelId, promptVersion: call.promptVersion, started, ctx: call.ctx, ok: true, usage: usageOf(res.usage as SdkUsage) });
        return { object: parsed.data, attempts: attempt + 1 };
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        const cause = (e as { cause?: unknown }).cause;
        if (cause) lastError += ` | cause: ${cause instanceof Error ? cause.message : String(cause)}`.slice(0, 600);
        await log({
          task: call.task, model: modelId, promptVersion: call.promptVersion, started, ctx: call.ctx, ok: false, error: lastError,
          usage: usageOf((e as { usage?: SdkUsage }).usage),
        });
        if (!isOutputProblem(e)) throw e; // network/auth errors: don't spend a repair attempt
      }
    }
    throw new AiOutputError(`AI output for "${call.task}" failed validation after ${maxRepairs + 1} attempts: ${lastError}`, maxRepairs + 1);
  }

  /** Streaming text (Coach chat). Logs the run when the stream finishes or fails. */
  function runStream(call: { task: Task; system: string; messages: ModelMessage[]; promptVersion: string; ctx?: CallContext; temperature?: number }) {
    const modelId = modelFor(call.task, deps.env ?? process.env);
    const started = now();
    return streamText({
      model: deps.resolveModel(modelId),
      system: call.system,
      messages: call.messages,
      temperature: call.temperature,
      maxRetries: 2,
      onFinish: async ({ totalUsage }) => {
        await log({ task: call.task, model: modelId, promptVersion: call.promptVersion, started, ctx: call.ctx, ok: true, usage: usageOf(totalUsage as SdkUsage) });
      },
      onError: async ({ error }) => {
        await log({
          task: call.task, model: modelId, promptVersion: call.promptVersion, started, ctx: call.ctx, ok: false,
          error: error instanceof Error ? error.message : String(error), usage: {},
        });
      },
    });
  }

  return { runObject, runStream };
}

export type Gateway = ReturnType<typeof createGateway>;

class SchemaMismatch extends Error {
  constructor(msg: string) {
    super(`schema validation failed: ${msg}`);
    this.name = 'SchemaMismatch';
  }
}

/** True when the model answered but the answer was unusable (bad JSON / schema mismatch). */
export function isOutputProblem(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return (
    /NoObjectGenerated|NoOutputGenerated|JSONParse|TypeValidation|SchemaMismatch/.test(e.name ?? '') ||
    /schema validation failed|could not parse|No object generated|no output generated/i.test(e.message)
  );
}
