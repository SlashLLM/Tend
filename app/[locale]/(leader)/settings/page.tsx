import { PageHeader } from '@/components/tend/page-header';
import { PreferencesForm } from '@/components/shell/preferences-form';
import { getSession } from '@/lib/auth/session';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const s = (await getSession())!;
  return (
    <>
      <PageHeader dateline="Settings" title="Preferences" />
      <PreferencesForm locale={s.profile.locale === 'zh' ? 'zh' : 'en'} textScale={s.profile.text_scale} peerMatch={null} />
    </>
  );
}
