'use client';
import { useLocale } from 'next-intl';
import { useEffect } from 'react';
import { LOCALE_PREFIX_RE, type Locale } from '@/i18n/routing';

/**
 * The language saved in Preferences is the source of truth. If the URL is in another language
 * (an old bookmark, a stale NEXT_LOCALE cookie), reset the cookie and reload in the saved one.
 */
export function LocaleSync({ preferred }: { preferred: Locale }) {
  const current = useLocale();
  useEffect(() => {
    if (current === preferred) return;
    document.cookie = `NEXT_LOCALE=${preferred}; path=/; max-age=31536000; samesite=lax`;
    const { pathname, search, hash } = window.location;
    const path = pathname.replace(LOCALE_PREFIX_RE, '') || '/';
    window.location.replace(`${preferred === 'en' ? path : `/${preferred}${path === '/' ? '' : path}`}${search}${hash}`);
  }, [current, preferred]);
  return null;
}
