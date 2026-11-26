import { getFormatter, getTranslations } from 'next-intl/server';
import { PageHeader, SectionTitle } from '@/components/tend/page-header';
import { Link } from '@/i18n/navigation';
import { getSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { InviteForm } from './invite-form';
import { ResetPasswordButton } from './reset-password-button';
import { pageTitle } from '@/lib/i18n/meta';

export const generateMetadata = pageTitle('admin');


export default async function AdminPage() {
  const supabase = await createClient();
  const t = await getTranslations('admin');
  const tr = await getTranslations('role');
  const ta = await getTranslations('audit');
  const format = await getFormatter();
  const roleName = (r: string) => (tr.has(r) ? tr(r) : r);
  const label = (group: 'action' | 'entity', v: string) => (ta.has(`${group}.${v}`) ? ta(`${group}.${v}`) : v.replace(/_/g, ' '));
  const me = (await getSession())?.userId;
  const [{ data: users }, { data: centres }, { data: audit }] = await Promise.all([
    supabase.from('app_user').select('id, full_name, email, locale, memberships:membership!membership_user_id_fkey(role, centre:centre_id(name))').order('full_name'),
    supabase.from('centre').select('id, name').order('name'),
    supabase.from('audit_log').select('id, action, entity, created_at, actor_id, subject_user_id').order('created_at', { ascending: false }).limit(25),
  ]);
  const people = (users ?? []) as unknown as { id: string; full_name: string; email: string; locale: string; memberships: { role: string; centre: { name: string } | null }[] }[];
  const nameOf = (id: string | null) => people.find((u) => u.id === id)?.full_name ?? '—';
  return (
    <>
      <PageHeader dateline={t('dateline')} title={t('title')} subtitle={t('subtitle')} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="users">
          <SectionTitle id="users" count={people.length}>{t('people')}</SectionTitle>
          <div className="tend-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr className="border-b"><th scope="col" className="px-3 py-2 font-medium">{t('person')}</th><th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">{t('roleCentre')}</th><th scope="col" className="px-3 py-2 text-right font-medium">{t('password')}</th></tr></thead>
              <tbody>
                {people.map((u) => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <span className="block font-medium">{u.full_name}</span>
                      <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{u.email}</span>
                      <span className="mt-0.5 block text-xs sm:hidden">{u.memberships.map((m) => `${roleName(m.role)}${m.centre ? ` · ${m.centre.name}` : ''}`).join(', ')}</span>
                    </td>
                    <td className="hidden px-3 py-2 sm:table-cell">
                      {u.memberships.map((m, i) => (
                        <span key={i} className="block whitespace-nowrap">
                          {roleName(m.role)}
                          {m.centre && <span className="block text-xs text-muted-foreground">{m.centre.name}</span>}
                        </span>
                      ))}
                    </td>
                    <td className="px-3 py-2 text-right">{u.id === me ? <Link href="/change-password" className="text-primary underline">{t('changeMine')}</Link> : <ResetPasswordButton userId={u.id} name={u.full_name} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <aside className="grid content-start gap-6">
          <section aria-labelledby="invite">
            <SectionTitle id="invite">{t('invite')}</SectionTitle>
            <InviteForm centres={centres ?? []} />
          </section>
          <section aria-labelledby="audit" className="tend-card p-5">
            <SectionTitle id="audit">{t('accessLog')}</SectionTitle>
            <ol className="grid gap-1.5 text-xs">
              {(audit ?? []).map((a) => (
                <li key={a.id}><span className="tabular-nums text-muted-foreground">{format.dateTime(new Date(a.created_at), { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span> · {nameOf(a.actor_id)} · {label('action', a.action)} · {label('entity', a.entity)}{a.subject_user_id ? t('about', { name: nameOf(a.subject_user_id) }) : ''}</li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
