import { z } from 'zod';
import type { Gateway } from '../gateway';

/**
 * Suggest which framework indicators an external course builds. Suggestions are never live on their
 * own: HQ approves them on the Programmes page. Codes are checked against the real framework, and
 * subdomain/skills-framework codes are derived in code, never taken from the model.
 */
const PROMPT_VERSION = 'catalogue.tag@1';

export type FrameworkIndicator = { code: string; name: string; subdomain_code: string; subdomain_name: string };
export type Framework = { indicators: FrameworkIndicator[]; tscByIndicator: Record<string, string[]> };

export type TagSuggestion = {
  relevant: boolean;
  indicator_codes: string[];
  subdomain_codes: string[];
  tsc_codes: string[];
  level_min: number;
  level_max: number;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  prompt_version: string;
  suggested_at: string;
};

const Out = z.object({
  relevant: z.boolean(),
  indicator_codes: z.array(z.string()).max(6),
  level_min: z.number().int().min(1).max(3),
  level_max: z.number().int().min(1).max(3),
  confidence: z.enum(['high', 'medium', 'low']),
  reason: z.string().max(400),
});
export type RawTags = z.infer<typeof Out>;

/** Keep only real indicator codes (max 4), derive subdomains and skills-framework codes, order levels. */
export function finaliseTags(raw: RawTags, fw: Framework, now = new Date()): TagSuggestion {
  const known = new Map(fw.indicators.map((i) => [i.code, i]));
  const indicator_codes = [...new Set(raw.indicator_codes.map((c) => c.trim()))].filter((c) => known.has(c)).slice(0, 4);
  const subdomain_codes = [...new Set(indicator_codes.map((c) => known.get(c)!.subdomain_code))];
  const tsc_codes = [...new Set(indicator_codes.flatMap((c) => fw.tscByIndicator[c] ?? []))];
  const lo = Math.min(raw.level_min, raw.level_max);
  const hi = Math.max(raw.level_min, raw.level_max);
  return {
    relevant: raw.relevant && indicator_codes.length > 0,
    indicator_codes,
    subdomain_codes,
    tsc_codes,
    level_min: lo,
    level_max: hi,
    confidence: indicator_codes.length ? raw.confidence : 'low',
    reason: raw.reason.trim().slice(0, 300),
    prompt_version: PROMPT_VERSION,
    suggested_at: now.toISOString(),
  };
}

export function frameworkList(fw: Framework): string {
  const bySub = new Map<string, FrameworkIndicator[]>();
  for (const i of fw.indicators) (bySub.get(i.subdomain_code) ?? bySub.set(i.subdomain_code, []).get(i.subdomain_code)!).push(i);
  return [...bySub.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([code, xs]) => `${code} ${xs[0].subdomain_name}\n${xs.map((i) => `  ${i.code} ${i.name}`).join('\n')}`)
    .join('\n');
}

export async function suggestCourseTags(
  course: { title: string; provider: string | null; description: string | null; hours: number | null },
  fw: Framework,
  gateway: Gateway,
): Promise<TagSuggestion> {
  const { object } = await gateway.runObject({
    task: 'catalogue.tag',
    schema: Out,
    promptVersion: PROMPT_VERSION,
    temperature: 0,
    system:
      'You map professional-development courses for Singapore preschool educators onto a teaching-quality framework. ' +
      'Choose only indicators the course clearly builds, using the exact codes given. Prefer 1–3 indicators; never invent codes. ' +
      'Levels: 1 = beginning educator, 2 = proficient, 3 = advanced/mentor. ' +
      'Set relevant=false (and no indicators) when the course is not about teaching or caring for young children (e.g. sports coaching, business admin, adult-only topics). ' +
      'The reason is one short sentence for an HQ reviewer.',
    prompt: `Framework indicators:
${frameworkList(fw)}

Course:
Title: ${course.title}
Provider: ${course.provider ?? 'unknown'}
Hours: ${course.hours ?? 'unknown'}
Description: ${(course.description ?? '').slice(0, 1800)}

Return JSON {"relevant": boolean, "indicator_codes": string[], "level_min": 1-3, "level_max": 1-3, "confidence": "high"|"medium"|"low", "reason": string}.`,
  });
  return finaliseTags(object, fw);
}
