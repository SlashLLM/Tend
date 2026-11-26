import { ArrowRight, ClipboardCheck, Loader2, MessagesSquare, Send } from 'lucide-react';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { EmptyState } from '@/components/tend/empty-state';
import { PageHeader, SectionTitle } from '@/components/tend/page-header';
import { dateline } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { pageTitle } from '@/lib/i18n/meta';

export const generateMetadata = pageTitle('reviews');

const GROUPS = [
  { key: 'draft', title: 'reviewsList.draft', statuses: ['processing', 'ai_draft', 'in_review'], icon: ClipboardCheck },
  { key: 'shared', title: 'reviewsList.shared', statuses: ['shared'], icon: Send },
  { key: 'debrief', title: 'reviewsList.debrief', statuses: ['acknowledged'], icon: MessagesSquare },
] as const;

export default async function ReviewsPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const format = await getFormatter();
  const supabase = await createClient();
  const { data } = await supabase
    .from('observation')
    .select('id, title, status, scheduled_at, educator:educator_id(full_name)')
    .in('status', ['processing', 'ai_draft', 'in_review', 'shared', 'acknowledged'])
    .order('scheduled_at', { ascending: false });
  const rows = (data ?? []) as unknown as { id: string; title: string; status: string; scheduled_at: string; educator: { full_name: string } }[];

  return (
    <>
      <PageHeader dateline={dateline(new Date(), locale)} title={t('reviewsList.title')} subtitle={t('reviewsList.subtitle')} />
      {rows.length === 0 ? (
        <EmptyState message={t('empty.reviews')} actionLabel={t('empty.reviewsAction')} href="/observe" />
      ) : (
        <div className="grid gap-8">
          {GROUPS.map((g) => {
            const items = rows.filter((r) => (g.statuses as readonly string[]).includes(r.status));
            if (!items.length) return null;
            const Icon = g.icon;
            return (
              <section key={g.key} aria-labelledby={`g-${g.key}`}>
                <SectionTitle id={`g-${g.key}`} count={items.length}>{t(g.title)}</SectionTitle>
                <ul className="tend-card divide-y">
                  {items.map((r) => (
                    <li key={r.id}>
                      <Link href={`/reviews/${r.id}`} className="tend-row group">
                        {r.status === 'processing' ? <Loader2 aria-hidden className="size-5 animate-spin text-primary" /> : <Icon aria-hidden className="size-5 text-primary" />}
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{r.educator.full_name}</span>
                          <span className="block truncate text-sm text-muted-foreground">{r.title ?? t('common.observation')} · {format.dateTime(new Date(r.scheduled_at), { day: 'numeric', month: 'short' })}</span>
                        </span>
                        <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
