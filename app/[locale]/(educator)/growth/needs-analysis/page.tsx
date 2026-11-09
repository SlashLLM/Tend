import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { LnaStepper } from '@/components/growth/lna-stepper';
import { PageHeader } from '@/components/tend/page-header';
import { startLna } from '@/app/actions/lna';
import type { Question } from '@/lib/lna/content';
import type { Answers } from '@/lib/lna/score';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';

export const metadata = { title: 'Needs analysis' };

export default async function NeedsAnalysisPage() {
  const locale = await getLocale();
  const supabase = await createClient();
  const session = (await getSession())!;
  // Resume an attempt in progress; if one is already finished, show its snapshot; only first-timers start a new one.
  const { data: attempts } = await supabase.from('lna_attempt').select('id, status').eq('educator_id', session.userId).order('started_at', { ascending: false });
  const open = attempts?.find((a) => a.status === 'in_progress');
  if (!open && attempts?.some((a) => a.status === 'completed')) redirect('/growth/snapshot');
  const attemptId = open?.id ?? (await startLna());
  const { data: att } = await supabase.from('lna_attempt').select('status, template:template_id(questions)').eq('id', attemptId).single();
  if (!att) redirect('/growth');
  const questions = (att.template as unknown as { questions: Question[] }).questions;
  const { data: rows } = await supabase.from('lna_answer').select('question_id, answer').eq('attempt_id', attemptId);
  const initial: Answers = Object.fromEntries((rows ?? []).map((r) => [r.question_id, r.answer as Answers[string]]));
  return (
    <>
      <PageHeader dateline="Needs analysis" title="What would you do?" subtitle="There are no right or wrong answers — this shapes your plan, not an appraisal." />
      <LnaStepper attemptId={attemptId} questions={questions} initial={initial} locale={locale} />
    </>
  );
}
