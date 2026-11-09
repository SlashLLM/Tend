import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { IdpEditor } from '@/components/growth/idp-editor';
import { IndicatorTag } from '@/components/tend/indicator-tag';
import { LevelStones } from '@/components/tend/level-stones';
import { PageHeader, SectionTitle } from '@/components/tend/page-header';
import { loadLnaState, loadPlans, loadTrajectory } from '@/lib/data/growth';
import { SUBDOMAIN_NAMES } from '@/lib/lna/content';
import { collapseByObservation, latestMove } from '@/lib/trajectory';
import { createClient } from '@/lib/supabase/server';
import { Suggestions } from './suggestions';
import { CoachDigest } from './coach-digest';
import { ProposedActions } from './proposed-actions';

export const metadata = { title: 'Educator 360' };

const STATUS: Record<string, string> = {
  scheduled: 'Scheduled', capturing: 'Capturing', processing: 'Drafting', ai_draft: 'AI draft', in_review: 'In review',
  shared: 'Shared', acknowledged: 'Read', discussed: 'Discussed', rejected: 'Set aside', cancelled: 'Cancelled',
};

export default async function Educator360({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: person } = await supabase.from('app_user').select('id, full_name, profile:educator_profile(years_experience, title:occupational_title_id(name))').eq('id', id).maybeSingle();
  if (!person) notFound();
  const [plans, lna, { data: obs }, { data: indicators }, { data: tried }] = await Promise.all([
    loadPlans(supabase, id),
    loadLnaState(supabase, id),
    supabase.from('observation').select('id, title, status, scheduled_at').eq('educator_id', id).order('scheduled_at', { ascending: false }).limit(12),
    supabase.from('indicator').select('code, name, framework_version!inner(status)').in('domain_code', ['1', '2', '3']).eq('framework_version.status', 'active').order('code'),
    supabase.from('strategy_attempt').select('id, tried_on').eq('educator_id', id).order('tried_on', { ascending: false }).limit(50),
  ]);
  const { data: suggestions } = plans.active
    ? await supabase.from('idp_suggestion').select('id, kind, payload, goal:idp_goal_id(indicator:indicator_id(code, name), current_level, target_level)').eq('status', 'pending').eq('idp_id', plans.active.id)
    : { data: [] };
  const activeGoals = plans.active?.goals ?? [];
  const trajectories = await Promise.all(activeGoals.map(async (g) => ({ g, pts: collapseByObservation(await loadTrajectory(supabase, id, g.indicator.id)) })));
  const mySuggestions = ((suggestions ?? []) as unknown as { id: string; kind: string; payload: { current_level?: number; target_level?: number }; goal: { indicator: { code: string; name: string }; current_level: number; target_level: number } | null }[])
    .filter((s) => s.goal);
  const profile = (person.profile as unknown as { years_experience: number; title: { name: string } | null }[] | { years_experience: number; title: { name: string } | null } | null);
  const prof = Array.isArray(profile) ? profile[0] : profile;

  return (
    <>
      <Link href="/educators" className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> Educators</Link>
      <PageHeader dateline={`Educator 360 · ${prof?.title?.name ?? 'Educator'} · ${prof?.years_experience ?? '—'} yrs`} title={person.full_name}
        subtitle={`${(tried ?? []).length} strategies tried · ${(obs ?? []).filter((o) => ['shared', 'acknowledged', 'discussed'].includes(o.status)).length} sets of growth notes shared`} />

      {mySuggestions.length > 0 && (
        <section className="mb-8" aria-labelledby="sugg">
          <SectionTitle id="sugg" count={mySuggestions.length}><Sparkles className="mr-1.5 inline size-4 text-amber" aria-hidden />Suggested plan updates</SectionTitle>
          <Suggestions items={mySuggestions.map((s) => ({ id: s.id, kind: s.kind, code: s.goal!.indicator.code, name: s.goal!.indicator.name, from: s.goal!.target_level, to: s.payload.target_level ?? null, level: s.payload.current_level ?? null }))} />
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div className="grid content-start gap-8">
          {plans.draft && (
            <section aria-labelledby="draft">
              <SectionTitle id="draft">Draft plan · co-create with {person.full_name.split(' ')[0]}</SectionTitle>
              <IdpEditor plan={plans.draft} viewer="leader" indicatorOptions={(indicators ?? []).map((i) => ({ code: i.code, name: i.name }))} educatorName={person.full_name} />
            </section>
          )}
          <section aria-labelledby="goals">
            <SectionTitle id="goals" count={activeGoals.length}>Active goals and trajectories</SectionTitle>
            {activeGoals.length === 0 ? (
              <p className="tend-card p-5 text-sm text-muted-foreground">No confirmed plan yet.</p>
            ) : (
              <ul className="tend-card divide-y">
                {trajectories.map(({ g, pts }) => {
                  const mv = latestMove(pts);
                  return (
                    <li key={g.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                      <span className="grid gap-1">
                        <IndicatorTag code={g.indicator.code} name={g.indicator.name} className="self-start" />
                        <span className="text-xs text-muted-foreground">
                          {pts.length} observation{pts.length === 1 ? '' : 's'}{mv ? ` · Level ${mv.from} → Level ${mv.to} in ${mv.weeks} weeks` : ''}
                        </span>
                      </span>
                      <LevelStones level={pts.at(-1)?.level ?? g.current_level} target={g.target_level} size="sm" />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="grid content-start gap-6">
          {lna?.result && (
            <section className="tend-card p-5" aria-labelledby="snap">
              <SectionTitle id="snap">Needs analysis</SectionTitle>
              <p className="text-sm"><span className="font-medium">Strengths:</span> {lna.result.strengths.map((s) => SUBDOMAIN_NAMES[s.subdomain]).join(', ')}</p>
              <p className="mt-1 text-sm"><span className="font-medium">Growing:</span> {lna.result.growth_areas.map((s) => SUBDOMAIN_NAMES[s.subdomain]).join(', ')}</p>
              {lna.result.agreement && <p className="mt-2 text-xs text-muted-foreground">“Reflects my growth areas”: {lna.result.agreement}</p>}
            </section>
          )}
          {plans.active && <ProposedActions idpId={plans.active.id} />}
          <CoachDigest educatorId={id} />
          <section className="tend-card p-5" aria-labelledby="timeline">
            <SectionTitle id="timeline">Observation timeline</SectionTitle>
            <ol className="grid gap-2">
              {(obs ?? []).map((o) => (
                <li key={o.id}>
                  <Link href={['scheduled', 'capturing'].includes(o.status) ? `/observe/${o.id}` : `/reviews/${o.id}`} className="flex items-center justify-between gap-3 rounded-md px-1 py-1.5 text-sm hover:bg-muted">
                    <span><span className="tabular-nums text-muted-foreground">{new Date(o.scheduled_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}</span> · {o.title}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">{STATUS[o.status]} <ArrowRight className="size-3" aria-hidden /></span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
