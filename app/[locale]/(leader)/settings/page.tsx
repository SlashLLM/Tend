import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/tend/page-header';
import { PreferencesForm } from '@/components/shell/preferences-form';
import { getSession } from '@/lib/auth/session';
import { toLocale } from '@/i18n/routing';
import { pageTitle } from '@/lib/i18n/meta';

export const generateMetadata = pageTitle('settings');

export default async function SettingsPage() {
  const s = (await getSession())!;
  const t = await getTranslations('prefs');
  return (
    <>
      <PageHeader dateline={t('settingsTitle')} title={t('dateline')} />
      <PreferencesForm locale={toLocale(s.profile.locale)} textScale={s.profile.text_scale} peerMatch={null} />
    </>
  );
}
