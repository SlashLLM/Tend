import { ExternalLink, GraduationCap, Users } from 'lucide-react';
import { IndicatorTag } from '@/components/tend/indicator-tag';
import { PageHeader, SectionTitle } from '@/components/tend/page-header';
import { getSession } from '@/lib/auth/session';
import { loadPlans } from '@/lib/data/growth';
import { rankPathway, type Candidate } from '@/lib/ranking/pathway';
import { createClient } from '@/lib/supabase/server';
import { AddToPlan } from './add-to-plan';

export const metadata = { title: 'Learn' };

const TIER: Record<string, string> = { peer: 'Peer', internal: 'In-house', micro: 'Micro-learning', course: 'Course' };

export default async function LearnPage({ searchParams }: { searchParams: Promise<{ goal?: string }> }) {
  const { goal: focusGoal } = await searchParams;
  const session = (await getSession())!;
  const supabase = await createClient();
  const plans = await loadPlans(supabase, session.userId);
  const goals = (plans.active?.goals ?? []).filter((g) => !focusGoal || g.id === focusGoal);
  const { data: acts } = await supabase.from('pd_activity').select('*');
  const { data: done } = await supabase.from('idp_action').select('pd_activity_id, status, idp_goal_id, pd:pd_activity_id(hours)').not('pd_activity_id', 'is', null);
  const cpd = ((done ?? []) as unknown as { status: string; pd: { hours: number } | null }[]).filter((a) => a.status === 'done').reduce((s, a) => s + Number(a.pd?.hours ?? 0), 0);
  const now = new Date();

  const sections = await Promise.all(
    goals.map(async (g) => {
      const { data: peers } = await supabase.rpc('peer_matches', { p_indicator_code: g.indicator.code });
      const cands: (Candidate & { provider?: string; mode?: string; hours?: number; fee?: number; url?: string | null; funding?: string | null })[] = [
        ...((peers ?? []) as { user_id: string; full_name: string }[]).slice(0, 2).map((p) => ({
          id: `peer-${p.user_id}`, tier: 'peer' as const, title: `Watch ${p.full_name} for 15 minutes`, indicator_codes: [g.indicator.code], tsc_codes: [], subdomain_codes: [], level_min: 1, level_max: 3, funded: true, next_run: null, preferred_mode: true,
        })),
        ...((acts ?? []) as Record<string, unknown>[]).map((a) => ({
          id: a.id as string, tier: a.tier as Candidate['tier'], title: a.title as string, indicator_codes: (a.indicator_codes as string[]) ?? [], tsc_codes: (a.tsc_codes as string[]) ?? [], subdomain_codes: (a.subdomain_codes as string[]) ?? [],
          level_min: a.level_min as number, level_max: a.level_max as number, funded: a.funded as boolean, next_run: a.next_run as string | null, preferred_mode: a.mode === 'In-centre' || a.mode === 'Video',
          provider: a.provider as string, mode: a.mode as string, hours: Number(a.hours ?? 0), fee: Number(a.fee_sgd ?? 0), url: a.url as string | null, funding: a.funding as string | null,
        })),
      ];
      const ranked = rankPathway(cands, { indicator: g.indicator.code, subdomain: g.indicator.code.split('.').slice(0, 2).join('.'), tsc: g.tsc?.code ?? null, current_level: g.current_level ?? 1, target_level: g.target_level }, now);
      return { g, ranked: ranked as (typeof cands[number] & { score: number; reasons: string[] })[] };
    }),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader dateline="Pathways" title="Learn" subtitle="Ranked for your goals — a colleague first, then in-house, micro-learning and courses. Every option says why." />
      <p className="-mt-3 mb-6 text-sm text-muted-foreground">CPD this year: <span className="font-medium text-foreground">{cpd} of 20 recommended hours</span></p>
      {sections.length === 0 && <p className="tend-card p-5 text-muted-foreground">Confirm a plan in My Growth to see learning matched to your goals.</p>}
      <div className="grid gap-10">
        {sections.map(({ g, ranked }) => (
          <section key={g.id} aria-labelledby={`p-${g.id}`}>
            <SectionTitle id={`p-${g.id}`}>For <IndicatorTag code={g.indicator.code} name={g.indicator.name} className="ml-1 align-middle" /></SectionTitle>
            {g.tsc && <p className="-mt-1 mb-3 text-xs text-muted-foreground">Skills Framework skill: {g.tsc.title}</p>}
            <ol className="grid gap-3">
              {ranked.map((r, i) => (
                <li key={r.id} className="tend-card grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="grid gap-1">
                    <p className="tend-dateline flex items-center gap-1.5">{r.tier === 'peer' ? <Users className="size-3.5" aria-hidden /> : <GraduationCap className="size-3.5" aria-hidden />}{i + 1} · {TIER[r.tier]}{r.provider && r.tier !== 'peer' ? ` · ${r.provider}` : ''}</p>
                    <p className="font-medium">{r.title}</p>
                    <p className="text-sm text-success">{r.reasons.join(' · ')}</p>
                    {r.tier !== 'peer' && (
                      <p className="text-xs text-muted-foreground">
                        {[r.mode, r.hours ? `${r.hours} h` : null, r.fee ? `S$${r.fee}` : 'Free', r.funding, r.next_run ? `next run ${new Date(r.next_run).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}` : null].filter(Boolean).join(' · ')}
                        {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-0.5 text-primary underline underline-offset-2">Details <ExternalLink className="size-3" aria-hidden /></a>}
                      </p>
                    )}
                  </div>
                  <AddToPlan goalId={g.id} title={r.title} pdActivityId={r.tier === 'peer' ? null : r.id} already={g.actions.some((a) => a.description === r.title)} />
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
