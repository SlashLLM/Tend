import { getLocale, getTranslations } from 'next-intl/server';
import { indicatorName } from '@/lib/i18n/content';
import { getSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/tend/page-header';
import { CoachChat } from './coach-chat';
import { pageTitle } from '@/lib/i18n/meta';

export const generateMetadata = pageTitle('coach');

export default async function CoachPage({ searchParams }: { searchParams: Promise<{ goal?: string }> }) {
  const { goal } = await searchParams;
  const session = (await getSession())!;
  const t = await getTranslations('coach');
  const supabase = await createClient();
  const { data: thread } = await supabase.from('coach_thread').select('id').eq('educator_id', session.userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const { data: msgs } = thread
    ? await supabase.from('coach_message').select('role, content, citations').eq('thread_id', thread.id).order('created_at')
    : { data: [] };
  let goalLabel: string | null = null;
  if (goal) {
    const { data } = await supabase.from('idp_goal').select('indicator:indicator_id(code, name)').eq('id', goal).maybeSingle();
    const ind = (data?.indicator as unknown as { code: string; name: string } | null) ?? null;
    goalLabel = ind ? `${ind.code} ${indicatorName(await getLocale(), ind.code, ind.name)}` : null;
  }
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader dateline={t('dateline')} title={t('title')} subtitle={t('subtitle')} />
      <CoachChat
        initialThread={thread?.id ?? null}
        initial={(msgs ?? []).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content, citations: (m.citations as { label: string }[]) ?? [] }))}
        goalId={goal ?? null}
        goalLabel={goalLabel}
      />
    </div>
  );
}
