'use server';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';
import { enforceCitations, narrativeText } from '@/lib/pipeline/citations';
import { processObservation } from '@/lib/pipeline/store';
import { hasToneIssue } from '@/lib/pipeline/tone';
import type { NarrativeContent } from '@/lib/pipeline/types';
import { editRatio, wer } from '@/lib/text/edit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const uuid = z.string().uuid();
const Sentence = z.object({ text: z.string().trim().min(1).max(600), evidence_ids: z.array(uuid).min(1) });
const Content = z.object({
  glows: z.array(Sentence).max(3),
  grows: z.array(Sentence).max(2),
  next_step: Sentence.extend({ goal_id: uuid.nullable() }),
});

async function assertLeader(obsId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc('can_lead_obs_public', { p_obs: obsId });
  if (!data) throw new Error('Not allowed');
  return supabase;
}

export async function beginReview(obsId: string) {
  uuid.parse(obsId);
  const supabase = await createClient();
  await supabase.rpc('begin_review', { p_obs: obsId });
}

export async function reviewTag(tagId: string, action: 'accept' | 'reject' | 'change_level', level?: number) {
  uuid.parse(tagId);
  const supabase = await createClient();
  const { error } = await supabase.rpc('review_tag', { p_tag: tagId, p_action: action, p_level: level ?? null });
  if (error) throw new Error(error.message);
  revalidatePath('/', 'layout');
}

export async function addTag(obsId: string, indicatorId: string, level: number, valence: 'glow' | 'grow', evidenceId: string | null) {
  uuid.parse(obsId);
  uuid.parse(indicatorId);
  const supabase = await createClient();
  const { error } = await supabase.rpc('add_tag', { p_obs: obsId, p_indicator: indicatorId, p_level: level, p_valence: valence, p_evidence: evidenceId, p_reason: 'Added by leader' });
  if (error) throw new Error(error.message);
  revalidatePath('/', 'layout');
}

/**
 * THE approval gate, server side. Validates the final text (citations, no judgemental words),
 * records edit ratio + transcript WER + active review time, then calls approve_and_share (RLS + role checked in SQL).
 */
export async function approveAndShare(input: {
  obsId: string;
  content: NarrativeContent;
  activeMs: number;
  corrections: { unitId: string; text: string }[];
  dismissedCards: string[];
}) {
  const obsId = uuid.parse(input.obsId);
  const content = Content.parse(input.content);
  const activeMs = z.number().int().min(0).max(4 * 3600_000).parse(Math.round(input.activeMs));
  const corrections = z.array(z.object({ unitId: uuid, text: z.string().trim().min(1).max(2000) })).max(100).parse(input.corrections);
  const dismissed = z.array(uuid).max(20).parse(input.dismissedCards);
  const supabase = await assertLeader(obsId);
  const admin = createAdminClient();

  const { data: units } = await admin.from('evidence_unit').select('id, text').eq('observation_id', obsId);
  const valid = (units ?? []).map((u) => u.id);
  const { content: enforced, removed } = enforceCitations(structuredClone(content) as NarrativeContent, valid);
  if (removed > 0) throw new Error('Every sentence needs evidence. Link each sentence to at least one moment.');
  for (const s of [...enforced.glows, ...enforced.grows, enforced.next_step]) {
    if (hasToneIssue(s.text)) throw new Error(`Please use developmental wording: “${s.text.slice(0, 60)}…”`);
  }

  // Edit ratio against the AI draft (interpretation-acceptance KPI).
  const { data: ai } = await admin.from('narrative').select('content').eq('observation_id', obsId).eq('author', 'ai').order('version', { ascending: false }).limit(1).maybeSingle();
  const ratio = ai ? editRatio(narrativeText(ai.content as NarrativeContent), narrativeText(enforced)) : 0;

  // Transcript corrections → WER (transcription-accuracy KPI), and the corrected text is kept.
  if (corrections.length) {
    const byId = new Map((units ?? []).map((u) => [u.id, u.text]));
    let errs = 0;
    let wordsTotal = 0;
    for (const c of corrections) {
      const original = byId.get(c.unitId);
      if (original == null) continue;
      const n = c.text.split(/\s+/).length;
      errs += wer(original, c.text) * n;
      wordsTotal += n;
      await admin.from('evidence_unit').update({ text: c.text }).eq('id', c.unitId).eq('observation_id', obsId);
    }
    const allWords = (units ?? []).reduce((a, u) => a + u.text.split(/\s+/).length, 0);
    await admin.from('observation').update({ transcript_wer: Math.min(1, errs / Math.max(allWords, wordsTotal, 1)) }).eq('id', obsId);
  } else {
    await admin.from('observation').update({ transcript_wer: 0 }).eq('id', obsId);
  }
  if (dismissed.length) await admin.from('coaching_card').update({ status: 'dismissed' }).in('id', dismissed).eq('observation_id', obsId);

  const { error } = await supabase.rpc('approve_and_share', { p_obs: obsId, p_content: enforced, p_edit_ratio: ratio, p_review_active_ms: activeMs });
  if (error) throw new Error(error.message);
  revalidatePath('/', 'layout');
  return { editRatio: ratio };
}

export async function regenerate(obsId: string) {
  uuid.parse(obsId);
  await assertLeader(obsId);
  const admin = createAdminClient();
  const { data: o } = await admin.from('observation').select('status').eq('id', obsId).single();
  if (!o || !['ai_draft', 'in_review'].includes(o.status)) throw new Error('Only a draft can be regenerated');
  await admin.from('observation').update({ status: 'processing', pipeline_step: 'queued' }).eq('id', obsId);
  after(async () => {
    await processObservation(createAdminClient(), obsId, { retranscribe: false });
  });
  revalidatePath('/', 'layout');
}

export async function setAside(obsId: string) {
  uuid.parse(obsId);
  const supabase = await createClient();
  const { error } = await supabase.rpc('reject_observation', { p_obs: obsId });
  if (error) throw new Error(error.message);
  revalidatePath('/', 'layout');
}

export async function completeDebrief(obsId: string, notes: string, actions: { goal_id: string; description: string }[], agenda: unknown) {
  uuid.parse(obsId);
  const text = z.string().max(4000).parse(notes);
  const acts = z.array(z.object({ goal_id: uuid, description: z.string().trim().min(3).max(300) })).max(5).parse(actions);
  const supabase = await createClient();
  const { error } = await supabase.rpc('complete_debrief', { p_obs: obsId, p_notes: text, p_actions: acts, p_agenda: agenda ?? null });
  if (error) throw new Error(error.message);
  revalidatePath('/', 'layout');
}
