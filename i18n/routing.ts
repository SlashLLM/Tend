import { defineRouting } from 'next-intl/routing';

/** English, 中文 and Bahasa Melayu now; தமிழ் in the pilot (PRD M1.3). */
export const LOCALES = ['en', 'zh', 'ms'] as const;
export type Locale = (typeof LOCALES)[number];

/** Per-locale settings used outside next-intl's message catalogue. */
export const LOCALE_META: Record<Locale, { label: string; htmlLang: string; intl: string; aiLanguage: string }> = {
  en: { label: 'English', htmlLang: 'en-SG', intl: 'en-SG', aiLanguage: 'English' },
  zh: { label: '中文', htmlLang: 'zh-Hans', intl: 'zh-CN', aiLanguage: 'Simplified Chinese' },
  ms: { label: 'Bahasa Melayu', htmlLang: 'ms-SG', intl: 'ms-SG', aiLanguage: 'Malay (Bahasa Melayu)' },
};

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: 'en',
  localePrefix: 'as-needed', // /today (en), /zh/today (zh), /ms/today (ms)
});

export function isLocale(x: unknown): x is Locale {
  return typeof x === 'string' && (LOCALES as readonly string[]).includes(x);
}

/** Any string → a supported locale (falls back to the default). */
export function toLocale(x: unknown): Locale {
  return isLocale(x) ? x : routing.defaultLocale;
}

/** Matches a leading locale segment, e.g. "/zh" or "/ms/today". */
export const LOCALE_PREFIX_RE = new RegExp(`^/(${LOCALES.join('|')})(?=/|$)`);
