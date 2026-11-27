import type { Area } from '@/lib/auth/roles';

/**
 * Version of the AI-processing notice staff acknowledge at first sign-in (PRD §11 "Consent and
 * notification"). Bump it when the notice text changes: everyone whose latest acknowledgement is
 * older is shown the notice again.
 */
export const AI_NOTICE_VERSION = '2026-10';

export const ONBOARDING_STEPS = ['language', 'textSize', 'intro', 'role', 'notice'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** `?step=` → a valid step index (lets the language switch reload the page and carry on). */
export function stepIndex(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n >= 0 && n < ONBOARDING_STEPS.length ? n : 0;
}

/** Where people go once onboarding is done: educators straight into the needs analysis (PRD §6 "Other journeys"). */
export function afterOnboardingPath(area: Area | null, home: string): string {
  return area === 'educator' ? '/growth/needs-analysis' : home;
}
