import type { SupabaseClient } from '@supabase/supabase-js';
import type { Gateway } from '@/lib/ai/gateway';
import { suggestCourseTags, type Framework } from '@/lib/ai/tasks/course-tags';
import { datasetUpdatedAt, downloadDataset } from './skillsfuture';
import { buildCatalogue, DATASETS, type ImportedActivity } from './transform';

/**
 * Sync the sector course catalogue from SkillsFuture open data.
 *   1. download + filter early-childhood CPD courses
 *   2. insert new ones as `pending_review`; refresh facts (fees, next run…) on existing ones, keeping HQ's tags/status
 *   3. retire courses that left the feed, and the demo "Sample:" courses
 *   4. AI-suggest framework tags for up to `tagLimit` untagged pending courses (the rest on the next run)
 * Runs with the service-role client: the sector catalogue (org_id null) is shared, and callers check the role.
 */
export type SyncTrigger = 'cron' | 'manual' | 'cli';
export type SyncResult = { fetched: number; inserted: number; updated: number; retired: number; tagged: number; tagFailures: number; pendingUntagged: number };

type Deps = {
  admin: SupabaseClient;
  gateway: Gateway | null;
  trigger: SyncTrigger;
  now?: Date;
  tagLimit?: number;
  /** Test seam: supply rows instead of downloading. */
  load?: () => Promise<{ courses: Record<string, string>[]; runs: Record<string, string>[]; updatedAt: string | null }>;
};

/** Singapore calendar date. */
export function sgDate(d: Date): string {
  return new Date(d.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

const FACTS = (a: ImportedActivity, updatedAt: string) => ({
  source: 'skillsfuture',
  source_ref: a.source_ref,
  org_id: null,
  tier: 'course',
  provider: a.provider,
  title: a.title,
  description: a.description,
  mode: a.mode,
  hours: a.hours,
  fee_sgd: a.fee_sgd,
  fee_after_subsidy_sgd: a.fee_after_subsidy_sgd,
  funded: a.funded,
  funding: a.funding,
  next_run: a.next_run,
  url: a.url,
  source_updated_at: updatedAt,
});

async function defaultLoad() {
  const [courses, runs, updatedAt] = await Promise.all([downloadDataset(DATASETS.courses), downloadDataset(DATASETS.runs), datasetUpdatedAt(DATASETS.courses)]);
  return { courses, runs, updatedAt };
}

export async function loadFramework(admin: SupabaseClient): Promise<Framework> {
  const [{ data: inds, error: e1 }, { data: maps, error: e2 }] = await Promise.all([
    admin.from('indicator').select('code, name, subdomain_code, subdomain_name, framework_version!inner(status)').eq('framework_version.status', 'active').order('code'),
    admin.from('indicator_tsc_map').select('indicator:indicator_id(code), tsc:tsc_id(code)'),
  ]);
  if (e1 || e2) throw new Error(`framework: ${(e1 ?? e2)!.message}`);
  const tscByIndicator: Record<string, string[]> = {};
  for (const m of (maps ?? []) as unknown as { indicator: { code: string } | null; tsc: { code: string } | null }[]) {
    if (m.indicator && m.tsc) (tscByIndicator[m.indicator.code] ??= []).push(m.tsc.code);
  }
  return {
    indicators: ((inds ?? []) as { code: string; name: string; subdomain_code: string; subdomain_name: string }[]).map(({ code, name, subdomain_code, subdomain_name }) => ({ code, name, subdomain_code, subdomain_name })),
    tscByIndicator,
  };
}

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

export async function syncCatalogue(deps: Deps): Promise<SyncResult> {
  const { admin } = deps;
  const now = deps.now ?? new Date();
  const run = (await must(admin.from('catalogue_sync_run').insert({ trigger: deps.trigger }).select('id').single(), 'start run')) as { id: string };
  const result: SyncResult = { fetched: 0, inserted: 0, updated: 0, retired: 0, tagged: 0, tagFailures: 0, pendingUntagged: 0 };
  let sourceUpdatedAt: string | null = null;
  try {
    const { courses, runs, updatedAt } = await (deps.load ?? defaultLoad)();
    sourceUpdatedAt = updatedAt ?? sgDate(now);
    const feed = buildCatalogue(courses, runs, sgDate(now));
    result.fetched = feed.length;

    const existing = await must(
      admin.from('pd_activity').select('id, source_ref, title, description, status').eq('source', 'skillsfuture'),
      'load existing',
    ) as { id: string; source_ref: string; title: string; description: string | null; status: string }[];
    const byRef = new Map(existing.map((e) => [e.source_ref, e]));

    const fresh = feed.filter((a) => !byRef.has(a.source_ref));
    const known = feed.filter((a) => byRef.has(a.source_ref));
    const changedText = known.filter((a) => {
      const e = byRef.get(a.source_ref)!;
      return e.status === 'pending_review' && (e.title !== a.title || (e.description ?? '') !== a.description);
    });
    const changedRefs = new Set(changedText.map((a) => a.source_ref));

    for (const batch of chunks(fresh, 200)) {
      await must(admin.from('pd_activity').insert(batch.map((a) => ({ ...FACTS(a, sourceUpdatedAt!), status: 'pending_review' }))), 'insert courses');
    }
    result.inserted = fresh.length;
    for (const batch of chunks(known.filter((a) => !changedRefs.has(a.source_ref)), 200)) {
      await must(admin.from('pd_activity').upsert(batch.map((a) => FACTS(a, sourceUpdatedAt!)), { onConflict: 'source,source_ref' }), 'update courses');
    }
    for (const batch of chunks(changedText, 200)) {
      await must(admin.from('pd_activity').upsert(batch.map((a) => ({ ...FACTS(a, sourceUpdatedAt!), tag_suggestion: null })), { onConflict: 'source,source_ref' }), 'update changed courses');
    }
    result.updated = known.length;

    // Retire courses that disappeared, unless the feed looks broken (e.g. a format change emptied it).
    const inFeed = new Set(feed.map((a) => a.source_ref));
    const gone = existing.filter((e) => !inFeed.has(e.source_ref) && e.status !== 'retired').map((e) => e.id);
    const liveBefore = existing.filter((e) => e.status !== 'retired').length;
    if (gone.length && feed.length >= Math.max(20, liveBefore * 0.5)) {
      for (const ids of chunks(gone, 200)) await must(admin.from('pd_activity').update({ status: 'retired' }).in('id', ids), 'retire gone');
      result.retired += gone.length;
    }
    // The made-up demo courses give way to real ones (retired, not deleted: plan items and PLCs may point at them).
    if (feed.length > 0) {
      const samples = await must(
        admin.from('pd_activity').update({ status: 'retired' }).eq('source', 'seed').eq('tier', 'course').neq('status', 'retired').select('id'),
        'retire samples',
      ) as { id: string }[];
      result.retired += samples.length;
    }

    // AI tag suggestions for courses awaiting review.
    const limit = deps.tagLimit ?? 60;
    if (deps.gateway && limit > 0) {
      const todo = await must(
        admin.from('pd_activity').select('id, title, provider, description, hours').eq('source', 'skillsfuture').eq('status', 'pending_review').is('tag_suggestion', null).order('next_run', { ascending: true, nullsFirst: false }).limit(limit),
        'load untagged',
      ) as { id: string; title: string; provider: string | null; description: string | null; hours: number | null }[];
      if (todo.length) {
        const fw = await loadFramework(admin);
        const gateway = deps.gateway;
        for (const batch of chunks(todo, 4)) {
          await Promise.all(
            batch.map(async (c) => {
              try {
                const s = await suggestCourseTags(c, fw, gateway);
                await must(admin.from('pd_activity').update({ tag_suggestion: s }).eq('id', c.id), 'save suggestion');
                result.tagged++;
              } catch {
                result.tagFailures++;
              }
            }),
          );
        }
      }
    }
    const { count } = await admin.from('pd_activity').select('id', { count: 'exact', head: true }).eq('source', 'skillsfuture').eq('status', 'pending_review').is('tag_suggestion', null);
    result.pendingUntagged = count ?? 0;

    await admin.from('catalogue_sync_run').update({ ...pick(result), ok: true, finished_at: new Date().toISOString(), source_updated_at: sourceUpdatedAt }).eq('id', run.id);
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from('catalogue_sync_run').update({ ...pick(result), ok: false, finished_at: new Date().toISOString(), source_updated_at: sourceUpdatedAt, error: msg.slice(0, 1000) }).eq('id', run.id);
    throw e;
  }
}

function pick(r: SyncResult) {
  return { fetched: r.fetched, inserted: r.inserted, updated: r.updated, retired: r.retired, tagged: r.tagged };
}
