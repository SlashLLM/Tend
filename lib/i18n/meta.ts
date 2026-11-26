import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

/** `export const generateMetadata = pageTitle('home')` — the tab title in the user's language. */
export function pageTitle(key: string) {
  return async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'meta' });
    return { title: t(key) };
  };
}
