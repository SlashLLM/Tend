import { MessageSquareQuote, ThumbsDown, ThumbsUp } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { indicatorName } from '@/lib/i18n/content';
import { AiLabel } from '@/components/tend/ai-label';
import { FeedbackCard } from '@/components/tend/feedback-card';
import { SectionTitle } from '@/components/tend/page-header';
import { buildAgenda, type AgendaPhrases } from '@/lib/debrief';
import type { NarrativeContent } from '@/lib/pipeline/types';
import { createClient } from '@/lib/supabase/server';
import { DebriefPanel } from './debrief-panel';

/** After sharing: what the educator sees, their reflection and responses, and Debrief Mode. */
export async function SharedSummary({ obsId, educatorId, educatorName, status, reviewer }: { obsId: string; educatorId: string; educatorName: string; status: string; reviewer: string }) {
  const supabase = await createClient();
  const t = await getTranslations('sharedSummary');
  const locale = await getLocale();
  const ta = await getTranslations('debrief.agenda');
  const phrases: AgendaPhrases = {
    celebrate: (text) => ta('celebrate', { text }),
    celebrateDefault: ta('celebrateDefault'),
    youSaid: (text) => ta('youSaid', { text }),
    youAdded: (text) => ta('youAdded', { text }),
    whatWouldHelp: (text) => ta('whatWouldHelp', { text }),
    tryFirst: ta('tryFirst'),
    agree: (text) => ta('agree', { text }),
    agreeDefault: ta('agreeDefault'),
  };
  const [{ data: narr }, { data: units }, { data: responses }, { data: debrief }, { data: goals }] = await Promise.all([
    supabase.from('narrative').select('content').eq('observation_id', obsId).eq('is_final', true).maybeSingle(),
    supabase.from('evidence_unit').select('id, start_ms').eq('observation_id', obsId),
    supabase.from('educator_response').select('kind, target_ref, body, value, created_at').eq('observation_id', obsId).order('created_at'),
    supabase.from('debrief').select('agenda, notes, completed_at').eq('observation_id', obsId).maybeSingle(),
    supabase.from('idp_goal').select('id, indicator:indicator_id(code, name), idp!inner(educator_id, status)').eq('idp.educator_id', educatorId).eq('idp.status', 'active'),
  ]);
  const c = narr?.content as NarrativeContent | undefined;
  const ms = new Map((units ?? []).map((u) => [u.id, u.start_ms]));
  const ev = (ids: string[]) => ids.filter((i) => ms.has(i)).map((i) => ({ id: i, ms: ms.get(i)! }));
  const reflection = responses?.find((r) => r.kind === 'reflection');
  const contexts = (responses ?? []).filter((r) => r.kind === 'context');
  const thumbs = (responses ?? []).filter((r) => r.kind === 'thumbs').at(-1);
  const agreed = (responses ?? []).filter((r) => r.kind === 'agree').length;
  const agenda = (debrief?.agenda as ReturnType<typeof buildAgenda> | null) ?? (c ? buildAgenda({ glows: c.glows.map((g) => g.text), grows: c.grows.map((g) => g.text), nextStep: c.next_step.text, reflection: reflection?.body ?? null, contexts: contexts.map((x) => x.body ?? '') }, phrases) : null);
  const first = educatorName.split(' ')[0];

  return (
    <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
      <section className="grid content-start gap-3" aria-labelledby="shared-notes">
        <SectionTitle id="shared-notes">{t('notes')}</SectionTitle>
        <AiLabel reviewer={reviewer} />
        {c && (
          <>
            {c.glows.map((g, i) => <FeedbackCard key={`g${i}`} kind="glow" text={g.text} evidence={ev(g.evidence_ids)} />)}
            {c.grows.map((g, i) => <FeedbackCard key={`r${i}`} kind="grow" text={g.text} evidence={ev(g.evidence_ids)} />)}
            <FeedbackCard kind="next" text={c.next_step.text} evidence={ev(c.next_step.evidence_ids)} />
          </>
        )}
      </section>
      <aside className="grid content-start gap-6">
        <section className="tend-card grid gap-3 p-5" aria-labelledby="resp">
          <SectionTitle id="resp">{t('response', { name: first })}</SectionTitle>
          {!reflection ? (
            <p className="text-sm text-muted-foreground">{status === 'shared' ? t('waiting', { name: first }) : t('noReflection')}</p>
          ) : (
            <>
              <blockquote className="flex gap-2 text-sm"><MessageSquareQuote className="size-4 shrink-0 text-primary" aria-hidden /><span>“{reflection.body}”</span></blockquote>
              {agreed > 0 && <p className="text-sm">{t('agreed', { n: agreed })}</p>}
              {contexts.map((x, i) => <p key={i} className="rounded-md bg-muted px-3 py-2 text-sm">{t('addedContext', { text: x.body ?? '' })}</p>)}
              {thumbs && <p className="flex items-center gap-1.5 text-sm">{thumbs.value === 'up' ? <ThumbsUp className="size-4 text-success" aria-hidden /> : <ThumbsDown className="size-4 text-amber" aria-hidden />} {thumbs.value === 'up' ? t('foundHelpful') : t('foundLessHelpful')}</p>}
            </>
          )}
        </section>
        {agenda && (
          <DebriefPanel
            obsId={obsId}
            agenda={agenda}
            completed={debrief?.completed_at ?? null}
            notes={debrief?.notes ?? ''}
            canRun={status === 'shared' || status === 'acknowledged'}
            goals={((goals ?? []) as unknown as { id: string; indicator: { code: string; name: string } }[]).map((g) => ({ id: g.id, label: `${g.indicator.code} ${indicatorName(locale, g.indicator.code, g.indicator.name)}` }))}
            suggestedAction={c?.next_step.text.replace(/^Next step:\s*/i, '') ?? ''}
            suggestedGoal={c?.next_step.goal_id ?? null}
          />
        )}
      </aside>
    </div>
  );
}
