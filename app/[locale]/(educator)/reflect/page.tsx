import { Lock, Users } from 'lucide-react';
import { PageHeader } from '@/components/tend/page-header';
import { getFormatter, getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { JournalForm, DeleteEntry } from './journal';
import { pageTitle } from '@/lib/i18n/meta';

export const generateMetadata = pageTitle('reflect');

export default async function ReflectPage() {
  const session = (await getSession())!;
  const t = await getTranslations('reflect');
  const format = await getFormatter();
  const supabase = await createClient();
  const { data } = await supabase.from('reflection').select('id, body, visibility, created_at').eq('educator_id', session.userId).order('created_at', { ascending: false }).limit(50);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader dateline={t('dateline')} title={t('title')} subtitle={t('subtitle')} />
      <JournalForm />
      <ol className="mt-6 grid gap-3">
        {(data ?? []).length === 0 && <li className="text-sm text-muted-foreground">{t('empty')}</li>}
        {(data ?? []).map((r) => (
          <li key={r.id} className="tend-card grid gap-2 p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                {r.visibility === 'private' ? <><Lock className="size-3.5" aria-hidden /> {t('private')}</> : <><Users className="size-3.5" aria-hidden /> {t('sharedWithLeader')}</>}
                {' · '}{format.dateTime(new Date(r.created_at), { day: 'numeric', month: 'short' })}
              </span>
              <DeleteEntry id={r.id} />
            </div>
            <p className="whitespace-pre-wrap text-sm">{r.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
