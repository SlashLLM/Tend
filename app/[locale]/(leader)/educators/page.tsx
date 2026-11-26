import { ArrowRight } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PageHeader } from '@/components/tend/page-header';
import { getSession } from '@/lib/auth/session';
import { dateline } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { pageTitle } from '@/lib/i18n/meta';

export const generateMetadata = pageTitle('educators');

/** "Aisha binte Rahman" → "AR": first and last capitalised word, skipping "binte", "bin", "a/l". */
const initials = (name: string) => {
  const w = name.split(/\s+/).filter((x) => /^\p{Lu}/u.test(x));
  return ((w[0]?.[0] ?? '') + (w.length > 1 ? w.at(-1)![0] : '')).toUpperCase() || name.slice(0, 2).toUpperCase();
};

export default async function EducatorsPage() {
  const locale = await getLocale();
  const t = await getTranslations('educators');
  const session = (await getSession())!;
  const centreId = session.memberships.find((m) => m.role === 'leader')?.centre_id;
  const supabase = await createClient();
  const { data } = await supabase
    .from('educator_profile')
    .select('user_id, years_experience, age_group, user:user_id(full_name), title:occupational_title_id(name)')
    .eq('centre_id', centreId!)
    .order('user_id');
  const { data: ce } = await supabase.from('class_educator').select('user_id, class:class_id(name)');
  const classesOf = (id: string) => ((ce ?? []) as unknown as { user_id: string; class: { name: string } }[]).filter((c) => c.user_id === id).map((c) => c.class.name);
  const { data: idps } = await supabase.from('idp').select('educator_id, status').in('status', ['draft', 'active']);
  const statusOf = (id: string) => {
    const s = (idps ?? []).filter((i) => i.educator_id === id).map((i) => i.status);
    return s.includes('draft') ? t('draftPlan') : s.includes('active') ? t('activePlan') : t('noPlan');
  };
  const people = ((data ?? []) as unknown as { user_id: string; years_experience: number; user: { full_name: string }; title: { name: string } | null }[])
    .sort((a, b) => a.user.full_name.localeCompare(b.user.full_name));

  return (
    <>
      <PageHeader dateline={dateline(new Date(), locale)} title={t('title')} subtitle={t('subtitle', { n: people.length })} />
      <ul className="tend-card divide-y">
        {people.map((p) => (
          <li key={p.user_id}>
            <Link href={`/educators/${p.user_id}`} className="tend-row group">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary font-semibold text-secondary-foreground" aria-hidden>
                {initials(p.user.full_name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{p.user.full_name}</span>
                <span className="block truncate text-sm text-muted-foreground">{p.title?.name ?? t('educator')} · {classesOf(p.user_id).join(', ') || '—'} · {t('years', { n: p.years_experience })}</span>
              </span>
              <span className="hidden text-sm text-muted-foreground sm:inline">{statusOf(p.user_id)}</span>
              <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
