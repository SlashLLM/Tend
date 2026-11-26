import { AlertTriangle, ExternalLink } from 'lucide-react';
import { IndicatorTag } from '@/components/tend/indicator-tag';
import { PageHeader } from '@/components/tend/page-header';
import { Link } from '@/i18n/navigation';
import type { TagSuggestion } from '@/lib/ai/tasks/course-tags';
import { ATTRIBUTION } from '@/lib/catalogue/transform';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { CourseActions } from './course-actions';
import { SyncButton } from './sync-button';

export const metadata = { title: 'Programmes' };
// "Sync now" downloads the open datasets and tags new courses inside this page's server action.
export const maxDuration = 300;

const TIER: Record<string, string> = { internal: 'In-house', micro: 'Micro-learning', course: 'Course', peer: 'Peer' };
const TABS = [
  { key: 'review', label: 'Needs review', status: 'pending_review' },
  { key: 'live', label: 'Live', status: 'active' },
  { key: 'retired', label: 'Retired', status: 'retired' },
] as const;

type Row = {
  id: string; tier: string; provider: string | null; title: string; mode: string | null; hours: number | null; fee_sgd: number | null;
  fee_after_subsidy_sgd: number | null; funded: boolean; next_run: string | null; url: string | null; indicator_codes: string[];
  level_min: number; level_max: number; source: string; status: string; tag_suggestion: TagSuggestion | null; tagged_by: string | null; source_updated_at: string | null;
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' });

export default async function ProgrammesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const supabase = await createClient();
  const [{ data: rows }, { data: lastRun }, { data: inds }] = await Promise.all([
    supabase
      .from('pd_activity')
      .select('id, tier, provider, title, mode, hours, fee_sgd, fee_after_subsidy_sgd, funded, next_run, url, indicator_codes, level_min, level_max, source, status, tag_suggestion, tagged_by, source_updated_at')
      .order('next_run', { ascending: true, nullsFirst: false })
      .order('title'),
    supabase.from('catalogue_sync_run').select('started_at, finished_at, ok, fetched, inserted, retired, tagged, error').order('started_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('indicator').select('code, name, framework_version!inner(status)').eq('framework_version.status', 'active').order('code'),
  ]);
  const all = (rows ?? []) as Row[];
  const counts = Object.fromEntries(TABS.map((t) => [t.key, all.filter((r) => r.status === t.status).length]));
  const tab = TABS.find((t) => t.key === tabParam) ?? (counts.review ? TABS[0] : TABS[1]);
  const list = all.filter((r) => r.status === tab.status);
  const names = new Map(((inds ?? []) as { code: string; name: string }[]).map((i) => [i.code, i.name]));
  const indicators = [...names].map(([code, name]) => ({ code, name }));
  const stale = (d: string | null) => !d || Date.now() - new Date(d).getTime() > 90 * 86_400_000;

  return (
    <>
      <PageHeader
        dateline="Catalogue"
        title="Programmes"
        subtitle="Early-childhood courses from the SkillsFuture course directory, plus your in-house learning. New courses get AI-suggested framework skills; approve them here before they are recommended to educators."
        actions={<SyncButton />}
      />
      <p className="-mt-3 mb-5 text-sm text-muted-foreground">
        {lastRun
          ? lastRun.ok
            ? `Last synced ${fmtDate(lastRun.finished_at ?? lastRun.started_at)}: ${lastRun.fetched} courses in the feed, ${lastRun.inserted} new, ${lastRun.tagged} tagged.`
            : lastRun.ok === false
              ? `Last sync failed on ${fmtDate(lastRun.started_at)}: ${lastRun.error ?? 'unknown error'}`
              : 'A sync is running…'
          : 'Not synced yet. The catalogue refreshes automatically on the 1st of each month, or press Sync now.'}
      </p>

      <nav aria-label="Catalogue status" className="mb-4 flex flex-wrap gap-1.5 sm:gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/programmes?tab=${t.key}`}
            aria-current={t.key === tab.key ? 'page' : undefined}
            className={cn('inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-medium sm:gap-2 sm:px-4', t.key === tab.key ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}
          >
            {t.label} <span className="tabular-nums opacity-80">{counts[t.key]}</span>
          </Link>
        ))}
      </nav>

      {list.length === 0 ? (
        <p className="tend-card p-5 text-muted-foreground">{tab.key === 'review' ? 'Nothing waiting for review.' : 'No programmes here.'}</p>
      ) : (
        <ol className="grid gap-3">
          {list.map((a) => {
            const s = a.tag_suggestion;
            const fee = Number(a.fee_sgd ?? 0);
            const after = a.fee_after_subsidy_sgd === null ? null : Number(a.fee_after_subsidy_sgd);
            return (
              <li key={a.id} className="tend-card grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-start">
                <div className="grid min-w-0 gap-1.5">
                  <p className="tend-dateline">
                    {TIER[a.tier] ?? a.tier}
                    {a.provider ? ` · ${a.provider}` : ''}
                    {a.source === 'skillsfuture' ? ' · SkillsFuture' : a.source === 'seed' && a.tier === 'course' ? ' · Sample' : ''}
                  </p>
                  <p className="font-medium">
                    {a.title}
                    {a.tier === 'course' && stale(a.source_updated_at) && <AlertTriangle className="ml-1 inline size-3.5 text-amber" aria-label="Listing older than 90 days" />}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      a.mode,
                      a.hours ? `${a.hours} h` : null,
                      fee ? (after !== null && after < fee ? `S$${fee} → S$${after} after subsidy` : `S$${fee}`) : 'Free',
                      a.next_run ? `next run ${fmtDate(a.next_run)}` : a.tier === 'course' ? 'no upcoming run listed' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    {a.url && !a.url.includes('example.org') && (
                      <a href={a.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-0.5 text-primary underline underline-offset-2">
                        Details <ExternalLink className="size-3" aria-hidden />
                      </a>
                    )}
                  </p>
                  {a.status === 'active' && a.indicator_codes.length > 0 && (
                    <p className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground">Skills{a.tagged_by ? ` (${a.tagged_by === 'hq' ? 'chosen by HQ' : 'AI, approved'})` : ''}:</span>
                      {a.indicator_codes.map((c) => <IndicatorTag key={c} code={c} name={names.get(c) ?? c} />)}
                      <span className="text-muted-foreground">· levels {a.level_min}–{a.level_max}</span>
                    </p>
                  )}
                  {a.status === 'pending_review' && (
                    <div className="mt-1 rounded-lg bg-muted/60 p-3 text-sm">
                      {s ? (
                        <>
                          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                            AI suggestion · {s.confidence} confidence{!s.relevant ? ' · looks unrelated to early-childhood teaching' : ''}
                          </p>
                          {s.indicator_codes.length > 0 && (
                            <p className="mb-1.5 flex flex-wrap gap-1.5">
                              {s.indicator_codes.map((c) => <IndicatorTag key={c} code={c} name={names.get(c) ?? c} />)}
                              <span className="text-xs text-muted-foreground">levels {s.level_min}–{s.level_max}</span>
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">{s.reason}</p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">No AI suggestion yet. It will be added on the next sync, or choose the skills yourself.</p>
                      )}
                    </div>
                  )}
                </div>
                <CourseActions
                  id={a.id}
                  title={a.title}
                  status={a.status as 'active' | 'pending_review' | 'retired'}
                  canApprove={!!s && s.indicator_codes.length > 0}
                  current={{ codes: a.status === 'active' ? a.indicator_codes : (s?.indicator_codes ?? []), levelMin: a.status === 'active' ? a.level_min : (s?.level_min ?? 1), levelMax: a.status === 'active' ? a.level_max : (s?.level_max ?? 3) }}
                  indicators={indicators}
                />
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-8 text-xs text-muted-foreground">{ATTRIBUTION}</p>
    </>
  );
}
