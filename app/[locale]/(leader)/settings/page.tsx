import { PageHeader } from '@/components/tend/page-header';
import { PreferencesForm } from '@/components/shell/preferences-form';
import { getSession } from '@/lib/auth/session';
import { toLocale } from '@/i18n/routing';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const s = (await getSession())!;
  return (
    <>
      <PageHeader dateline="Settings" title="Preferences" />
      <PreferencesForm locale={toLocale(s.profile.locale)} textScale={s.profile.text_scale} peerMatch={null} />
    </>
  );
}
