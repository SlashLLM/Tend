import { EyeOff, Users } from 'lucide-react';
import { getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PageHeader, SectionTitle } from '@/components/tend/page-header';
import { getSession } from '@/lib/auth/session';
import { dateline } from '@/lib/format';
import { buildMatrix, growingBySubdomain, proposeGroup, SUBDOMAINS, type HeatRow } from '@/lib/heatmap';
import { SUBDOMAIN_NAMES } from '@/lib/lna/content';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';
import { CreateGroup } from './create-group';

export const metadata = { title: 'Centre Insights' };

const LEVEL_CLASS = ['bg-card', 'bg-primary/15', 'bg-primary/40', 'bg-primary text-primary-foreground'];

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ sd?: string }> }) {
  const { sd } = await searchParams;
  const locale = await getLocale();
  const session = (await getSession())!;
  const centreId = session.memberships.find((m) => m.role === 'leader')?.centre_id ?? '';
  const supabase = await createClient();
  const [{ data: heat }, { data: spots }, { data: eds }, { data: groups }, { data: acts }] = await Promise.all([
    supabase.rpc('centre_heatmap', { p_centre: centreId }),
    supabase.rpc('blind_spots', { p_centre: centreId }),
    supabase.from('educator_profile').select('user_id, age_group, user:user_id(full_name)').eq('centre_id', centreId).eq('age_group', 'preschool'),
    supabase.from('plc').select('id, name, member_ids, lead_ids, weeks').eq('centre_id', centreId).order('created_at', { ascending: false }),
    supabase.from('pd_activity').select('id, title, tier, subdomain_codes').in('tier', ['internal', 'course']),
  ]);
  const educators = ((eds ?? []) as unknown as { user_id: string; user: { full_name: string } }[]).map((e) => ({ id: e.user_id, name: e.user.full_name }));
  const m = buildMatrix((heat ?? []) as HeatRow[], educators);
  const growing = growingBySubdomain(m);
  const spotRows = (spots ?? []) as { kind: string; code: string; name: string; educators: number }[];
  const shared = spotRows.filter((s) => s.kind === 'shared_growth');
  const none = spotRows.filter((s) => s.kind === 'no_evidence');

  // Drill-down: one subdomain → its indicators (counts of accepted evidence per educator)
  let drill: { code: string; name: string }[] = [];
  let drillCounts = new Map<string, number>();
  if (sd && (SUBDOMAINS as readonly string[]).includes(sd)) {
    const { data: inds } = await supabase.from('indicator').select('code, name, framework_version!inner(status)').eq('subdomain_code', sd).eq('framework_version.status', 'active').order('code');
    drill = (inds ?? []).map((i) => ({ code: i.code, name: i.name }));
    const { data: tags } = await supabase.from('tag').select('indicator:indicator_id!inner(code, subdomain_code), observation:observation_id!inner(educator_id, centre_id)').eq('state', 'accepted').eq('indicator.subdomain_code', sd).eq('observation.centre_id', centreId);
    drillCounts = new Map();
    for (const t of (tags ?? []) as unknown as { indicator: { code: string }; observation: { educator_id: string } }[]) {
      const k = `${t.observation.educator_id}|${t.indicator.code}`;
      drillCounts.set(k, (drillCounts.get(k) ?? 0) + 1);
    }
  }

  return (
    <>
      <PageHeader dateline={dateline(new Date(), locale)} title="Centre Insights" subtitle="Where the centre is growing together — built only from approved evidence. Levels, never scores." />

      <section aria-labelledby="heat" className="mb-10">
        <SectionTitle id="heat" action={sd ? <Link href="/insights" className="text-sm text-primary hover:underline">Back to all subdomains</Link> : undefined}>
          {sd ? `${sd} ${SUBDOMAIN_NAMES[sd]} · by indicator` : 'Heatmap · educators × subdomains'}
        </SectionTitle>
        <div className="tend-card overflow-x-auto p-3">
          {!sd ? (
            <table className="w-full min-w-[720px] border-separate border-spacing-1 text-sm">
              <caption className="sr-only">Most recent observed level per educator and subdomain, with evidence counts</caption>
              <thead>
                <tr>
                  <th scope="col" className="text-left font-medium text-muted-foreground">Educator</th>
                  {SUBDOMAINS.map((s) => (
                    <th key={s} scope="col" className="font-medium">
                      <Link href={`/insights?sd=${s}`} className="block rounded px-1 py-1 hover:bg-muted" title={SUBDOMAIN_NAMES[s]}>
                        {s}<span className="block text-[0.65rem] font-normal text-muted-foreground">{growing[s]} growing</span>
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.educators.map((e) => (
                  <tr key={e.id}>
                    <th scope="row" className="whitespace-nowrap pr-2 text-left font-normal"><Link href={`/educators/${e.id}`} className="hover:underline">{e.name}</Link></th>
                    {SUBDOMAINS.map((s) => {
                      const c = m.cells[e.id][s];
                      return (
                        <td key={s}
                          className={cn('h-11 rounded-md text-center tabular-nums', LEVEL_CLASS[c.level ?? 0], c.grows > 0 && 'tend-stripes', c.count === 0 && 'border border-dashed')}
                          aria-label={`${e.name}, ${SUBDOMAIN_NAMES[s]}: ${c.level ? `seen at Level ${c.level}` : 'not yet observed'}, ${c.count} evidence${c.grows ? `, ${c.grows} growth notes` : ''}`}>
                          {c.level ? <><span className="font-semibold">L{c.level}</span><span className="ml-1 text-[0.7rem]">·{c.count}</span></> : <span className="text-muted-foreground">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[720px] border-separate border-spacing-1 text-sm">
              <caption className="sr-only">Evidence count per educator and indicator</caption>
              <thead><tr><th className="text-left font-medium text-muted-foreground">Educator</th>{drill.map((i) => <th key={i.code} scope="col" title={i.name} className="font-medium">{i.code}</th>)}</tr></thead>
              <tbody>
                {m.educators.map((e) => (
                  <tr key={e.id}>
                    <th scope="row" className="whitespace-nowrap pr-2 text-left font-normal">{e.name}</th>
                    {drill.map((i) => {
                      const n = drillCounts.get(`${e.id}|${i.code}`) ?? 0;
                      return <td key={i.code} className={cn('h-10 rounded-md text-center tabular-nums', n === 0 ? 'border border-dashed text-muted-foreground' : n < 3 ? 'bg-primary/15' : 'bg-primary/40')}>{n || '—'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 flex flex-wrap gap-4 px-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block size-3 rounded bg-primary/15" /> L1</span>
            <span className="flex items-center gap-1"><span className="inline-block size-3 rounded bg-primary/40" /> L2</span>
            <span className="flex items-center gap-1"><span className="inline-block size-3 rounded bg-primary" /> L3</span>
            <span className="flex items-center gap-1"><span className="tend-stripes inline-block size-3 rounded border" /> has growth notes</span>
            <span>· number = evidence count</span>
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="tend-card p-5" aria-labelledby="spots">
          <SectionTitle id="spots"><EyeOff className="mr-1.5 inline size-4" aria-hidden />Blind spots</SectionTitle>
          <p className="mb-2 text-sm text-muted-foreground">No evidence in the last 90 days:</p>
          <ul className="mb-4 flex flex-wrap gap-1.5">
            {none.slice(0, 18).map((s) => <li key={s.code} className="rounded-full border border-dashed px-2.5 py-1 text-xs" title={s.name}>{s.code} {s.name}</li>)}
            {none.length > 18 && <li className="text-xs text-muted-foreground">+{none.length - 18} more</li>}
          </ul>
          <p className="mb-2 text-sm text-muted-foreground">Shared growth areas:</p>
          <ul className="grid gap-1.5 text-sm">
            {shared.map((s) => <li key={s.code}><span className="font-medium">{s.code} {s.name}</span> — {s.educators} of {educators.length} educators growing</li>)}
          </ul>
        </section>

        <section className="tend-card p-5" aria-labelledby="plc">
          <SectionTitle id="plc"><Users className="mr-1.5 inline size-4" aria-hidden />Learning groups</SectionTitle>
          {shared.slice(0, 2).map((s) => {
            const g = proposeGroup(m, s.code);
            const act = (acts ?? []).find((a) => (a.subdomain_codes as string[]).includes(s.code) && a.tier === 'internal') ?? (acts ?? []).find((a) => (a.subdomain_codes as string[]).includes(s.code));
            return (
              <div key={s.code} className="mb-4 grid gap-1.5 rounded-lg bg-muted/50 p-3 text-sm">
                <p className="font-medium">4-week group: {s.name}</p>
                <p className="text-muted-foreground">{g.members.length} members · peer leads: {g.leads.map((l) => l.name).join(', ') || 'none yet'}{act ? ` · with “${act.title}”` : ''}</p>
                <CreateGroup centreId={centreId} name={`${s.name} group`} subdomain={s.code} memberIds={g.members.map((x) => x.id)} leadIds={g.leads.map((x) => x.id)} pdActivityId={act?.id ?? null} />
              </div>
            );
          })}
          {(groups ?? []).length > 0 && (
            <ul className="grid gap-1 text-sm">
              {(groups ?? []).map((g) => <li key={g.id}>✓ {g.name} · {(g.member_ids as string[]).length} members · {g.weeks} weeks</li>)}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
