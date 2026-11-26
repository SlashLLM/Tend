import type { Metadata, Viewport } from 'next';
import { Figtree, Noto_Sans } from 'next/font/google';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getSession } from '@/lib/auth/session';
import { isLocale, LOCALE_META } from '@/i18n/routing';
import '../globals.css';

const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree', display: 'swap' });
const notoSans = Noto_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: isLocale(locale) ? locale : 'en', namespace: 'meta' });
  return { title: { default: t('appTitle'), template: '%s · Tend' }, description: t('appDescription'), applicationName: 'Tend' };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f5' },
    { media: '(prefers-color-scheme: dark)', color: '#141816' },
  ],
};

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const [messages, session] = await Promise.all([getMessages(), getSession().catch(() => null)]);
  const textScale = Math.min(130, Math.max(100, session?.profile.text_scale ?? 100));

  return (
    <html lang={LOCALE_META[locale].htmlLang} style={{ ['--text-scale' as string]: String(textScale) }} suppressHydrationWarning>
      <body className={`${figtree.variable} ${notoSans.variable}`}>
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Singapore">
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster position="top-center" />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
