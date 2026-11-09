import { PageHeader } from '@/components/tend/page-header';
import { PreferencesForm } from '@/components/shell/preferences-form';
import { getSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Preferences' };

export default async function PreferencesPage() {
  const s = (await getSession())!;
  const supabase = await createClient();
  const { data } = await supabase.from('educator_profile').select('peer_match_opt_in').eq('user_id', s.userId).maybeSingle();
  const { data: access } = await supabase.from('audit_log').select('id, action, entity, created_at').eq('subject_user_id', s.userId).order('created_at', { ascending: false }).limit(10);
  return (
    <>
      <PageHeader dateline="Preferences" title="Your settings" />
      <PreferencesForm locale={s.profile.locale === 'zh' ? 'zh' : 'en'} textScale={s.profile.text_scale} peerMatch={data?.peer_match_opt_in ?? false} />
      <section className="tend-card mt-6 max-w-xl p-5" aria-labelledby="access">
        <h2 id="access" className="mb-2 font-semibold">Who accessed your records</h2>
        <ol className="grid gap-1 text-sm">
          {(access ?? []).length === 0 && <li className="text-muted-foreground">No access recorded.</li>}
          {(access ?? []).map((a) => <li key={a.id}><span className="tabular-nums text-muted-foreground">{new Date(a.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}</span> · {a.action.replace('_', ' ')} · {a.entity.replace('_', ' ')}</li>)}
        </ol>
      </section>
    </>
  );
}
