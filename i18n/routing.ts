import { defineRouting } from 'next-intl/routing';

/** English and 中文 now; Bahasa Melayu and தமிழ் in the pilot (PRD M1.3). */
export const LOCALES = ['en', 'zh'] as const;
export type Locale = (typeof LOCALES)[number];

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: 'en',
  localePrefix: 'as-needed', // /today (en), /zh/today (zh)
});

export function isLocale(x: unknown): x is Locale {
  return typeof x === 'string' && (LOCALES as readonly string[]).includes(x);
}
