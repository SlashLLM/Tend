import 'server-only';
import { cookies } from 'next/headers';
import type { Locale } from '@/i18n/routing';

/**
 * next-intl's middleware routes unprefixed paths (/home) by this cookie, so it must follow the
 * user's saved language — otherwise switching zh → en bounces straight back to /zh/home.
 */
export async function setLocaleCookie(locale: Locale) {
  (await cookies()).set('NEXT_LOCALE', locale, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
}
