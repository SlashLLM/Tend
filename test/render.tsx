import { render, type RenderOptions } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import ms from '../messages/ms.json';
import zh from '../messages/zh.json';

const MESSAGES = { en, zh, ms } as const;

export function renderWithIntl(ui: React.ReactElement, { locale = 'en', ...opts }: { locale?: keyof typeof MESSAGES } & RenderOptions = {}) {
  return render(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Asia/Singapore">
      {ui}
    </NextIntlClientProvider>,
    opts,
  );
}
