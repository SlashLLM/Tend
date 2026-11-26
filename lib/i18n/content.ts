/**
 * Framework and needs-analysis content in Chinese and Malay, keyed by code.
 * The database (and the AI pipeline) keep the English source text; these lookups only change
 * what a reader sees. Anything not found falls back to the English text passed in.
 * Translations are Tend drafts, pending review by Agape's curriculum team (like the English descriptors).
 */
import type { Locale } from '@/i18n/routing';
import ms from './content/ms.json';
import zh from './content/zh.json';

type IndicatorText = { name: string; levels?: string[]; look_fors?: string[] };
type Content = {
  frameworks: Record<string, string>;
  domains: Record<string, string>;
  subdomains: Record<string, string>;
  indicators: Record<string, IndicatorText>;
  tsc: Record<string, string>;
  scenarios: Record<string, { prompt: string; l1: string; l2: string; l3: string }>;
};

const BY_LOCALE: Partial<Record<string, Content>> = { zh: zh as Content, ms: ms as Content };
const pick = (locale: Locale | string) => BY_LOCALE[locale];

export function indicatorName(locale: Locale | string, code: string, fallback: string): string {
  return pick(locale)?.indicators[code]?.name ?? fallback;
}

/** Level descriptors as stored in the DB: { '1': …, '2': …, '3': … }. */
export function indicatorLevels(locale: Locale | string, code: string, fallback: Record<string, string>): Record<string, string> {
  const l = pick(locale)?.indicators[code]?.levels;
  return l ? { '1': l[0], '2': l[1], '3': l[2] } : fallback;
}

/** Look-fors in the reader's language. Matched by position, so only when the English list has the same length. */
export function indicatorLookFors(locale: Locale | string, code: string, fallback: string[]): string[] {
  const l = pick(locale)?.indicators[code]?.look_fors;
  return l && l.length === fallback.length ? l : fallback;
}

/** Translate one English look-for of an indicator (used where look-fors are mixed from several goals). */
export function lookForText(locale: Locale | string, code: string, englishList: string[], text: string): string {
  const i = englishList.indexOf(text);
  const l = pick(locale)?.indicators[code]?.look_fors;
  return i >= 0 && l && l.length === englishList.length ? l[i] : text;
}

/** A QTT subdomain ('3.3') or an infant & toddler practice ('IT.4') by name — same meaning as SUBDOMAIN_NAMES. */
export function areaName(locale: Locale | string, code: string, fallback: string): string {
  const c = pick(locale);
  if (!c) return fallback;
  return code.startsWith('IT.') ? (c.indicators[code]?.name ?? fallback) : (c.subdomains[code] ?? fallback);
}

/** The subdomain an indicator belongs to ('3.3.4' → '3.3'; 'IT.2' → its group; TRUE values → 'Values'). */
export function indicatorSubdomain(locale: Locale | string, indicatorCode: string, fallback: string): string {
  const c = pick(locale);
  if (!c) return fallback;
  const parts = indicatorCode.split('.');
  const key = indicatorCode.startsWith('IT.') ? indicatorCode : parts.length === 3 ? `${parts[0]}.${parts[1]}` : 'TRUE';
  return c.subdomains[key] ?? fallback;
}

export function domainName(locale: Locale | string, code: string, fallback: string): string {
  return pick(locale)?.domains[code] ?? fallback;
}

export function tscTitle(locale: Locale | string, code: string, fallback: string): string {
  return pick(locale)?.tsc[code] ?? fallback;
}

export function frameworkName(locale: Locale | string, code: string, fallback: string): string {
  return pick(locale)?.frameworks[code] ?? fallback;
}

/** Needs-analysis scenario prompt for an indicator. */
export function scenarioPrompt(locale: Locale | string, indicatorCode: string, fallback: string): string {
  return pick(locale)?.scenarios[indicatorCode]?.prompt ?? fallback;
}

/** Needs-analysis scenario option for an indicator at a level (1–3). */
export function scenarioOption(locale: Locale | string, indicatorCode: string, level: number, fallback: string): string {
  const s = pick(locale)?.scenarios[indicatorCode];
  const key = `l${level}` as 'l1' | 'l2' | 'l3';
  return s?.[key] ?? fallback;
}
