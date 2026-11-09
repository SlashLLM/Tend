import { ArrowRight, ClipboardCheck, Loader2, MessagesSquare, Send } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { EmptyState } from '@/components/tend/empty-state';
import { PageHeader, SectionTitle } from '@/components/tend/page-header';
import { dateline } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Reviews' };

const GROUPS = [
  { key: 'draft', title: 'Waiting for your review', statuses: ['processing', 'ai_draft', 'in_review'], icon: ClipboardCheck },
  { key: 'shared', title: 'Shared · waiting for the educator', statuses: ['shared'], icon: Send },
  { key: 'debrief', title: 'Ready to debrief', statuses: ['acknowledged'], icon: MessagesSquare },
] as const;

export default async function ReviewsPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const supabase = await createClient();
  const { data } = await supabase
    .from('observation')
    .select('id, title, status, scheduled_at, educator:educator_id(full_name)')
    .in('status', ['processing', 'ai_draft', 'in_review', 'shared', 'acknowledged'])
    .order('scheduled_at', { ascending: false });
  const rows = (data ?? []) as unknown as { id: string; title: string; status: string; scheduled_at: string; educator: { full_name: string } }[];

  return (
    <>
      <PageHeader dateline={dateline(new Date(), locale)} title="Reviews" subtitle="Evidence beside every draft. Nothing reaches an educator until you approve it." />
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
                <SectionTitle id={`g-${g.key}`} count={items.length}>{g.title}</SectionTitle>
                <ul className="tend-card divide-y">
                  {items.map((r) => (
                    <li key={r.id}>
                      <Link href={`/reviews/${r.id}`} className="tend-row group">
                        {r.status === 'processing' ? <Loader2 aria-hidden className="size-5 animate-spin text-primary" /> : <Icon aria-hidden className="size-5 text-primary" />}
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{r.educator.full_name}</span>
                          <span className="block truncate text-sm text-muted-foreground">{r.title} · {new Date(r.scheduled_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })}</span>
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
