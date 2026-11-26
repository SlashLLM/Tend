import { getFormatter, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/tend/page-header';
import { PreferencesForm } from '@/components/shell/preferences-form';
import { getSession } from '@/lib/auth/session';
import { toLocale } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { pageTitle } from '@/lib/i18n/meta';

export const generateMetadata = pageTitle('preferences');

export default async function PreferencesPage() {
  const s = (await getSession())!;
  const t = await getTranslations('prefs');
  const ta = await getTranslations('audit');
  const format = await getFormatter();
  const label = (group: 'action' | 'entity', v: string) => (ta.has(`${group}.${v}`) ? ta(`${group}.${v}`) : v.replace(/_/g, ' '));
  const supabase = await createClient();
  // Peer Match is an educator setting: the switch only shows for people with an educator profile.
  const { data } = await supabase.from('educator_profile').select('peer_match_opt_in').eq('user_id', s.userId).maybeSingle();
  const { data: access } = await supabase.from('audit_log').select('id, action, entity, created_at').eq('subject_user_id', s.userId).order('created_at', { ascending: false }).limit(10);
  return (
    <>
      <PageHeader dateline={t('dateline')} title={t('title')} />
      <PreferencesForm locale={toLocale(s.profile.locale)} textScale={s.profile.text_scale} peerMatch={data ? (data.peer_match_opt_in ?? false) : null} />
      <section className="tend-card mt-6 max-w-xl p-5" aria-labelledby="access">
        <h2 id="access" className="mb-2 font-semibold">{t('accessTitle')}</h2>
        <ol className="grid gap-1 text-sm">
          {(access ?? []).length === 0 && <li className="text-muted-foreground">{t('accessNone')}</li>}
          {(access ?? []).map((a) => <li key={a.id}><span className="tabular-nums text-muted-foreground">{format.dateTime(new Date(a.created_at), { day: 'numeric', month: 'short' })}</span> · {label('action', a.action)} · {label('entity', a.entity)}</li>)}
        </ol>
      </section>
    </>
  );
}
