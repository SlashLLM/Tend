'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { lnaSummary } from '@/lib/ai/tasks/lna-summary';
import { serverGateway } from '@/lib/ai/server';
import type { Question } from '@/lib/lna/content';
import { isComplete, scoreLna, type Answers } from '@/lib/lna/score';
import { createClient } from '@/lib/supabase/server';

const AnswerSchema = z.object({
  attemptId: z.string().uuid(),
  questionId: z.string().min(1).max(40),
  answer: z.object({ level: z.number().int().min(1).max(3).optional(), confidence: z.number().int().min(1).max(3).optional() }),
});

export async function startLna(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('start_lna');
  if (error) throw new Error(error.message);
  return data as string;
}

/** Autosave one answer (RLS: own, in-progress attempts only). */
export async function saveLnaAnswer(input: z.infer<typeof AnswerSchema>) {
  const { attemptId, questionId, answer } = AnswerSchema.parse(input);
  const supabase = await createClient();
  const { data: att } = await supabase.from('lna_attempt').select('org_id').eq('id', attemptId).single();
  if (!att) throw new Error('attempt not found');
  const { error } = await supabase
    .from('lna_answer')
    .upsert({ attempt_id: attemptId, org_id: att.org_id, question_id: questionId, answer, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** Score on the server (never trust the client), store the snapshot, create the draft IDP. */
export async function completeLna(attemptId: string, locale: string) {
  z.string().uuid().parse(attemptId);
  const supabase = await createClient();
  const { data: att } = await supabase.from('lna_attempt').select('id, org_id, template:template_id(questions)').eq('id', attemptId).single();
  if (!att) throw new Error('attempt not found');
  const questions = (att.template as unknown as { questions: Question[] }).questions;
  const { data: rows } = await supabase.from('lna_answer').select('question_id, answer').eq('attempt_id', attemptId);
  const answers: Answers = Object.fromEntries((rows ?? []).map((r) => [r.question_id, r.answer as Answers[string]]));
  if (!isComplete(questions, answers)) throw new Error('Please answer every question first.');
  const snapshot = scoreLna(questions, answers);
  const { summary } = await lnaSummary(snapshot, { gateway: serverGateway(), locale, orgId: att.org_id });
  const { error } = await supabase.rpc('complete_lna', { p_attempt: attemptId, p_snapshot: snapshot, p_summary: summary });
  if (error) throw new Error(error.message);
  revalidatePath('/[locale]/(educator)/growth', 'layout');
  return { ok: true };
}

export async function setLnaAgreement(attemptId: string, agreement: 'yes' | 'partly' | 'no') {
  z.string().uuid().parse(attemptId);
  z.enum(['yes', 'partly', 'no']).parse(agreement);
  const supabase = await createClient();
  const { error } = await supabase.from('lna_result').update({ agreement }).eq('attempt_id', attemptId);
  if (error) throw new Error(error.message);
  return { ok: true };
}
