import { z } from 'zod';
import { SUBDOMAIN_NAMES } from '@/lib/lna/content';
import type { Snapshot } from '@/lib/lna/score';
import type { Gateway } from '../gateway';

const PROMPT_VERSION = 'lna.snapshot@1';

/** Offline summary: plain words, no scores, ≤ 60 words. */
export function offlineLnaSummary(s: Snapshot): string {
  const names = (xs: { subdomain: string }[]) => xs.map((x) => `“${SUBDOMAIN_NAMES[x.subdomain] ?? x.subdomain}”`);
  const strengths = names(s.strengths.slice(0, 2));
  const growth = names(s.growth_areas.slice(0, 2));
  const parts = [];
  if (strengths.length) parts.push(`You show real strength in ${strengths.join(' and ')}.`);
  if (growth.length) parts.push(`Good next areas to grow are ${growth.join(' and ')}.`);
  parts.push('Your draft plan below turns these into up to three goals you can shape with your Centre Leader.');
  return parts.join(' ');
}

const Out = z.object({ summary: z.string().min(20).max(600) });

export async function lnaSummary(s: Snapshot, opts: { gateway?: Gateway | null; locale: string; orgId?: string }) {
  if (!opts.gateway) return { summary: offlineLnaSummary(s), mode: 'offline' as const };
  try {
    const { object } = await opts.gateway.runObject({
      task: 'lna.snapshot',
      schema: Out,
      promptVersion: PROMPT_VERSION,
      ctx: { orgId: opts.orgId },
      system:
        'You write a warm, plain-words summary of a preschool educator’s self-assessment. Growth, not grading: never use scores, numbers, ranks or words like weak, poor, failed. About a 12-year-old reading level, at most 60 words, second person.',
      prompt: `Language: ${opts.locale === 'zh' ? 'Simplified Chinese' : 'English'}.
Strengths: ${s.strengths.map((x) => SUBDOMAIN_NAMES[x.subdomain]).join('; ')}
Growth areas: ${s.growth_areas.map((x) => SUBDOMAIN_NAMES[x.subdomain]).join('; ')}
Return JSON {"summary": "..."}.`,
    });
    return { summary: object.summary, mode: 'luna' as const };
  } catch {
    return { summary: offlineLnaSummary(s), mode: 'offline' as const };
  }
}
