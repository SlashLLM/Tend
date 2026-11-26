import { AlertTriangle, ExternalLink } from 'lucide-react';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { indicatorName } from '@/lib/i18n/content';
import { IndicatorTag } from '@/components/tend/indicator-tag';
import { PageHeader } from '@/components/tend/page-header';
import { Link } from '@/i18n/navigation';
import type { TagSuggestion } from '@/lib/ai/tasks/course-tags';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { CourseActions } from './course-actions';
import { SyncButton } from './sync-button';
import { pageTitle } from '@/lib/i18n/meta';

export const generateMetadata = pageTitle('programmes');
// "Sync now" downloads the open datasets and tags new courses inside this page's server action.
export const maxDuration = 300;

const TIERS = new Set(['internal', 'micro', 'course', 'peer']);
const TABS = [
  { key: 'review', status: 'pending_review' },
  { key: 'live', status: 'active' },
  { key: 'retired', status: 'retired' },
] as const;

type Row = {
  id: string; tier: string; provider: string | null; title: string; mode: string | null; hours: number | null; fee_sgd: number | null;
  fee_after_subsidy_sgd: number | null; funded: boolean; next_run: string | null; url: string | null; indicator_codes: string[];
  level_min: number; level_max: number; source: string; status: string; tag_suggestion: TagSuggestion | null; tagged_by: string | null; source_updated_at: string | null;
};


export default async function ProgrammesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations('programmes');
  const locale = await getLocale();
  const tl = await getTranslations('learn');
  const format = await getFormatter();
  const fmtDate = (d: string) => format.dateTime(new Date(d), { day: 'numeric', month: 'short', year: 'numeric' });
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
  const counts = Object.fromEntries(TABS.map((x) => [x.key, all.filter((r) => r.status === x.status).length]));
  const tab = TABS.find((x) => x.key === tabParam) ?? (counts.review ? TABS[0] : TABS[1]);
  const list = all.filter((r) => r.status === tab.status);
  const names = new Map(((inds ?? []) as { code: string; name: string }[]).map((i) => [i.code, indicatorName(locale, i.code, i.name)]));
  const indicators = [...names].map(([code, name]) => ({ code, name }));
  const stale = (d: string | null) => !d || Date.now() - new Date(d).getTime() > 90 * 86_400_000;

  return (
    <>
      <PageHeader
        dateline={t('dateline')}
        title={t('title')}
        subtitle={t('subtitle')}
        actions={<SyncButton />}
      />
      <p className="-mt-3 mb-5 text-sm text-muted-foreground">
        {lastRun
          ? lastRun.ok
            ? t('lastSynced', { date: fmtDate(lastRun.finished_at ?? lastRun.started_at), fetched: lastRun.fetched, inserted: lastRun.inserted, tagged: lastRun.tagged })
            : lastRun.ok === false
              ? t('lastFailed', { date: fmtDate(lastRun.started_at), error: lastRun.error ?? t('unknownError') })
              : t('running')
          : t('notSynced')}
      </p>

      <nav aria-label={t('statusNav')} className="mb-4 flex flex-wrap gap-1.5 sm:gap-2">
        {TABS.map((x) => (
          <Link
            key={x.key}
            href={`/programmes?tab=${x.key}`}
            aria-current={x.key === tab.key ? 'page' : undefined}
            className={cn('inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-medium sm:gap-2 sm:px-4', x.key === tab.key ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}
          >
            {t(`tab.${x.key}`)} <span className="tabular-nums opacity-80">{counts[x.key]}</span>
          </Link>
        ))}
      </nav>

      {list.length === 0 ? (
        <p className="tend-card p-5 text-muted-foreground">{tab.key === 'review' ? t('nothingReview') : t('noProgrammes')}</p>
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
                    {TIERS.has(a.tier) ? tl(`tier.${a.tier}`) : a.tier}
                    {a.provider ? ` · ${a.provider}` : ''}
                    {a.source === 'skillsfuture' ? ' · SkillsFuture' : a.source === 'seed' && a.tier === 'course' ? t('sample') : ''}
                  </p>
                  <p className="font-medium">
                    {a.title}
                    {a.tier === 'course' && stale(a.source_updated_at) && <AlertTriangle className="ml-1 inline size-3.5 text-amber" aria-label={t('staleListing')} />}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      a.mode,
                      a.hours ? tl('hours', { n: a.hours }) : null,
                      fee ? (after !== null && after < fee ? t('afterSubsidy', { fee, after }) : `S$${fee}`) : tl('free'),
                      a.next_run ? tl('nextRun', { date: fmtDate(a.next_run) }) : a.tier === 'course' ? t('noRun') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    {a.url && !a.url.includes('example.org') && (
                      <a href={a.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-0.5 text-primary underline underline-offset-2">
                        {tl('details')} <ExternalLink className="size-3" aria-hidden />
                      </a>
                    )}
                  </p>
                  {a.status === 'active' && a.indicator_codes.length > 0 && (
                    <p className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground">{t('skills')}{a.tagged_by ? (a.tagged_by === 'hq' ? t('chosenByHq') : t('aiApproved')) : ''}:</span>
                      {a.indicator_codes.map((c) => <IndicatorTag key={c} code={c} name={names.get(c) ?? c} />)}
                      <span className="text-muted-foreground">· {t('levels', { min: a.level_min, max: a.level_max })}</span>
                    </p>
                  )}
                  {a.status === 'pending_review' && (
                    <div className="mt-1 rounded-lg bg-muted/60 p-3 text-sm">
                      {s ? (
                        <>
                          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                            {t('aiSuggestion', { confidence: t(`confidence.${s.confidence}`) })}{!s.relevant ? t('unrelated') : ''}
                          </p>
                          {s.indicator_codes.length > 0 && (
                            <p className="mb-1.5 flex flex-wrap gap-1.5">
                              {s.indicator_codes.map((c) => <IndicatorTag key={c} code={c} name={names.get(c) ?? c} />)}
                              <span className="text-xs text-muted-foreground">{t('levels', { min: s.level_min, max: s.level_max })}</span>
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">{s.reason}</p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">{t('noSuggestion')}</p>
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
      <p className="mt-8 text-xs text-muted-foreground">{t('attribution')}</p>
    </>
  );
}
