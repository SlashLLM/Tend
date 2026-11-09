import { render, type RenderOptions } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import zh from '../messages/zh.json';

const MESSAGES = { en, zh } as const;

export function renderWithIntl(ui: React.ReactElement, { locale = 'en', ...opts }: { locale?: 'en' | 'zh' } & RenderOptions = {}) {
  return render(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Asia/Singapore">
      {ui}
    </NextIntlClientProvider>,
    opts,
  );
}
