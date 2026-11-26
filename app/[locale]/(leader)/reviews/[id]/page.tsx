import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { indicatorName } from '@/lib/i18n/content';
import { Link } from '@/i18n/navigation';
import { PageHeader } from '@/components/tend/page-header';
import { PipelineProgress } from '@/components/review/pipeline-progress';
import { ReviewWorkspace, type ReviewCard, type ReviewTag, type ReviewUnit } from '@/components/review/review-workspace';
import { getSession } from '@/lib/auth/session';
import type { NarrativeContent } from '@/lib/pipeline/types';
import { createClient } from '@/lib/supabase/server';
import { SharedSummary } from './shared-summary';
import { pageTitle } from '@/lib/i18n/meta';

export const generateMetadata = pageTitle('review');

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = (await getSession())!;
  const t = await getTranslations('reviewPage');
  const format = await getFormatter();
  const locale = await getLocale();
  const supabase = await createClient();
  const { data: o } = await supabase
    .from('observation')
    .select('id, title, status, pipeline_step, scheduled_at, educator_id, approved_by, educator:educator_id(full_name), approver:approved_by(full_name)')
    .eq('id', id)
    .maybeSingle();
  if (!o) notFound();
  const educatorName = (o.educator as unknown as { full_name: string }).full_name;
  const header = (
    <>
      <Link href="/reviews" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> {t('back')}</Link>
      <PageHeader dateline={`${o.title} · ${format.dateTime(new Date(o.scheduled_at), { weekday: 'long', day: 'numeric', month: 'long' })}`} title={educatorName} />
    </>
  );

  if (o.status === 'processing' || o.status === 'capturing' || o.status === 'scheduled') {
    return <>{header}{o.status === 'processing' ? <PipelineProgress obsId={o.id} initialStep={o.pipeline_step} /> : <p className="text-muted-foreground">{t('notCaptured')} <Link className="text-primary underline" href={`/observe/${o.id}`}>{t('openCapture')}</Link></p>}</>;
  }
  if (o.status === 'rejected') return <>{header}<p className="tend-card p-5 text-muted-foreground">{t('rejected')}</p></>;

  if (o.status === 'ai_draft' || o.status === 'in_review') {
    const [{ data: units }, { data: tags }, { data: narr }, { data: cards }, { data: items }, { data: indicators }, { data: goals }] = await Promise.all([
      supabase.from('evidence_unit').select('id, idx, text, start_ms, end_ms, capture_item_ids').eq('observation_id', id).order('idx'),
      supabase.from('tag').select('id, evidence_unit_id, level, valence, confidence, state, source, reason, indicator:indicator_id(code, name)').eq('observation_id', id).order('created_at'),
      supabase.from('narrative').select('content, author, version').eq('observation_id', id).order('version', { ascending: false }).limit(1).single(),
      supabase.from('coaching_card').select('id, title, body').eq('observation_id', id).eq('status', 'draft'),
      supabase.from('capture_item').select('id, kind, t_offset_ms, storage_path').eq('observation_id', id).in('kind', ['photo', 'audio_chunk']).order('t_offset_ms'),
      supabase.from('indicator').select('id, code, name, framework_version!inner(status)').in('domain_code', ['1', '2', '3']).eq('framework_version.status', 'active').order('code'),
      supabase.from('idp_goal').select('id, indicator:indicator_id(code, name), idp!inner(educator_id, status)').eq('idp.educator_id', o.educator_id).eq('idp.status', 'active'),
    ]);
    const audio = (items ?? []).filter((i) => i.kind === 'audio_chunk' && i.storage_path);
    const photoSet = new Set((items ?? []).filter((i) => i.kind === 'photo' && i.storage_path).map((i) => i.id));
    const reviewUnits: ReviewUnit[] = (units ?? []).map((u) => ({
      id: u.id, idx: u.idx, text: u.text, start_ms: u.start_ms, end_ms: u.end_ms,
      photos: (u.capture_item_ids ?? []).filter((x: string) => photoSet.has(x)),
      audioId: [...audio].reverse().find((a) => a.t_offset_ms <= u.start_ms + 5000)?.id ?? audio[0]?.id ?? null,
    }));
    const reviewTags: ReviewTag[] = ((tags ?? []) as unknown as { id: string; evidence_unit_id: string | null; level: number; valence: 'glow' | 'grow'; confidence: number; state: string; source: string; reason: string | null; indicator: { code: string; name: string } }[]).map((t) => ({
      id: t.id, unitId: t.evidence_unit_id, code: t.indicator.code, name: t.indicator.name, level: t.level, valence: t.valence, confidence: Number(t.confidence), state: t.state, source: t.source, reason: t.reason,
    }));
    const growCodes = [...new Set(reviewTags.filter((t) => t.valence === 'grow' && t.state !== 'rejected').map((t) => t.code))].slice(0, 2);
    const peers = (
      await Promise.all(growCodes.map(async (code) => {
        const { data } = await supabase.rpc('peer_matches', { p_indicator_code: code });
        const first = ((data ?? []) as { full_name: string; user_id: string }[]).find((x) => x.user_id !== o.educator_id);
        return first ? { code, name: indicatorName(locale, code, reviewTags.find((x) => x.code === code)!.name), peer: first.full_name } : null;
      }))
    ).filter(Boolean) as { code: string; name: string; peer: string }[];

    return (
      <>
        {header}
        <ReviewWorkspace
          obsId={o.id}
          status={o.status}
          educatorName={educatorName}
          reviewerName={session.profile.full_name}
          units={reviewUnits}
          tags={reviewTags}
          draft={(narr?.content as NarrativeContent) ?? { glows: [], grows: [], next_step: { text: '', evidence_ids: [], goal_id: null } }}
          cards={(cards ?? []) as ReviewCard[]}
          indicators={(indicators ?? []).map((i) => ({ id: i.id, code: i.code, name: indicatorName(locale, i.code, i.name) }))}
          goals={((goals ?? []) as unknown as { id: string; indicator: { code: string; name: string } }[]).map((g) => ({ id: g.id, code: g.indicator.code, name: indicatorName(locale, g.indicator.code, g.indicator.name) }))}
          peers={peers}
          mode={o.pipeline_step?.split(':')[1] ?? 'offline'}
        />
      </>
    );
  }

  return <>{header}<SharedSummary obsId={o.id} educatorId={o.educator_id} educatorName={educatorName} status={o.status} reviewer={(o.approver as unknown as { full_name: string } | null)?.full_name ?? ''} /></>;
}
