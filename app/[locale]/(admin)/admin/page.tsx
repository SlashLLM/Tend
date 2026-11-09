import { PageHeader, SectionTitle } from '@/components/tend/page-header';
import { createClient } from '@/lib/supabase/server';
import { InviteForm } from './invite-form';

export const metadata = { title: 'Admin' };

export default async function AdminPage() {
  const supabase = await createClient();
  const [{ data: users }, { data: centres }, { data: audit }] = await Promise.all([
    supabase.from('app_user').select('id, full_name, email, locale, memberships:membership!membership_user_id_fkey(role, centre:centre_id(name))').order('full_name'),
    supabase.from('centre').select('id, name').order('name'),
    supabase.from('audit_log').select('id, action, entity, created_at, actor_id, subject_user_id').order('created_at', { ascending: false }).limit(25),
  ]);
  const people = (users ?? []) as unknown as { id: string; full_name: string; email: string; locale: string; memberships: { role: string; centre: { name: string } | null }[] }[];
  const nameOf = (id: string | null) => people.find((u) => u.id === id)?.full_name ?? '—';
  return (
    <>
      <PageHeader dateline="Administration" title="Users, roles and access" subtitle="Invite people by email. Every view or change of a person’s records is logged, and they can see who accessed them." />
      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <section aria-labelledby="users">
          <SectionTitle id="users" count={people.length}>People</SectionTitle>
          <div className="tend-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr className="border-b">{['Name', 'Email', 'Role · centre'].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {people.map((u) => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{u.full_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{u.email}</td>
                    <td className="px-3 py-2">{u.memberships.map((m) => `${m.role}${m.centre ? ` · ${m.centre.name}` : ''}`).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <aside className="grid content-start gap-6">
          <section aria-labelledby="invite">
            <SectionTitle id="invite">Invite</SectionTitle>
            <InviteForm centres={centres ?? []} />
          </section>
          <section aria-labelledby="audit" className="tend-card p-5">
            <SectionTitle id="audit">Recent access log</SectionTitle>
            <ol className="grid gap-1.5 text-xs">
              {(audit ?? []).map((a) => (
                <li key={a.id}><span className="tabular-nums text-muted-foreground">{new Date(a.created_at).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}</span> · {nameOf(a.actor_id)} · {a.action} {a.entity}{a.subject_user_id ? ` · about ${nameOf(a.subject_user_id)}` : ''}</li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
