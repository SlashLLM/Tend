import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { serverGateway } from '@/lib/ai/server';
import { runPipeline, type PipelineInput, type PipelineOutput, type Step } from './run';
import type { CaptureItem, IndicatorDoc } from './types';

/** Load everything the pipeline needs (service role — runs after the leader's End). */
export async function loadPipelineInput(admin: SupabaseClient, observationId: string): Promise<PipelineInput> {
  const { data: o, error } = await admin
    .from('observation')
    .select('id, org_id, centre_id, educator_id, class_id, focus_goal_ids, framework_version_id, class:class_id(level), educator:educator_id(full_name)')
    .eq('id', observationId)
    .single();
  if (error || !o) throw new Error(`observation not found: ${error?.message}`);

  const [{ data: items }, { data: roster }, { data: docs }, { data: goals }] = await Promise.all([
    admin.from('capture_item').select('id, kind, t_offset_ms, text, transcript').eq('observation_id', observationId).order('t_offset_ms'),
    // Whole-centre roster: children move between rooms, and a name from another class must still be redacted.
    admin.from('class_roster').select('child_name, aliases, centre_id').eq('centre_id', o.centre_id),
    admin.from('indicator').select('id, code, name, subdomain_code, subdomain_name, level_descriptors, look_fors').eq('framework_version_id', o.framework_version_id!),
    admin.from('idp_goal').select('id, current_level, target_level, indicator:indicator_id(code), idp!inner(educator_id, status)').eq('idp.educator_id', o.educator_id).eq('idp.status', 'active'),
  ]);
  const goalRows = (goals ?? []) as unknown as { id: string; current_level: number | null; target_level: number; indicator: { code: string } }[];
  const focusCodes = goalRows.filter((g) => (o.focus_goal_ids ?? []).includes(g.id)).map((g) => g.indicator.code);

  return {
    orgId: o.org_id,
    observationId,
    items: (items ?? []) as CaptureItem[],
    roster: (roster ?? []) as { child_name: string; aliases: string[] }[],
    docs: (docs ?? []) as IndicatorDoc[],
    ctx: {
      focusIndicatorCodes: focusCodes,
      goals: goalRows.map((g) => ({ id: g.id, code: g.indicator.code, current_level: g.current_level, target_level: g.target_level })),
      educatorFirstName: ((o.educator as unknown as { full_name: string })?.full_name ?? '').split(' ')[0],
      classLevel: (o.class as unknown as { level: string } | null)?.level ?? null,
      locale: 'en',
    },
    lastLevels: goalRows.map((g) => `${g.indicator.code}: L${g.current_level ?? '?'}`).join(', '),
  };
}

export async function savePipelineOutput(admin: SupabaseClient, input: PipelineInput, out: PipelineOutput) {
  const org = input.orgId;
  const obs = input.observationId;
  // idempotent re-run: clear previous AI output (only while still a draft)
  await admin.from('tag').delete().eq('observation_id', obs);
  await admin.from('evidence_unit').delete().eq('observation_id', obs);
  await admin.from('coaching_card').delete().eq('observation_id', obs).eq('status', 'draft');

  if (out.units.length) {
    const { error } = await admin.from('evidence_unit').insert(
      out.units.map((u) => ({ id: u.id, org_id: org, observation_id: obs, idx: u.idx, text: u.text, start_ms: u.start_ms, end_ms: u.end_ms, capture_item_ids: u.capture_item_ids })),
    );
    if (error) throw new Error(`evidence: ${error.message}`);
  }
  const docByCode = new Map(input.docs.map((d) => [d.code, d]));
  const { data: fv } = await admin.from('observation').select('framework_version_id, educator_id').eq('id', obs).single();
  if (out.tags.length) {
    const { error } = await admin.from('tag').insert(
      out.tags.map((t) => ({
        org_id: org, observation_id: obs, evidence_unit_id: t.unitId, indicator_id: docByCode.get(t.indicator)!.id, framework_version_id: fv!.framework_version_id,
        level: t.level, valence: t.valence, confidence: t.confidence, reason: t.reason, source: 'ai', state: 'suggested',
      })),
    );
    if (error) throw new Error(`tags: ${error.message}`);
  }
  const { data: maxV } = await admin.from('narrative').select('version').eq('observation_id', obs).order('version', { ascending: false }).limit(1).maybeSingle();
  const { error: nErr } = await admin.from('narrative').insert({ org_id: org, observation_id: obs, version: (maxV?.version ?? 0) + 1, author: 'ai', content: out.narrative });
  if (nErr) throw new Error(`narrative: ${nErr.message}`);
  if (out.cards.length) {
    await admin.from('coaching_card').insert(
      out.cards.map((c) => ({ org_id: org, observation_id: obs, educator_id: fv!.educator_id, indicator_id: docByCode.get(c.indicator)?.id ?? null, title: c.title, body: c.body, status: 'draft' })),
    );
  }
  await admin.from('observation').update({ status: 'ai_draft', pipeline_step: `done:${out.mode}` }).eq('id', obs);
}

/** Run the whole pipeline for one observation and persist the AI draft. Never throws to the caller. */
export async function processObservation(admin: SupabaseClient, observationId: string) {
  const setStep = async (s: Step) => {
    await admin.from('observation').update({ pipeline_step: s }).eq('id', observationId);
  };
  try {
    const input = await loadPipelineInput(admin, observationId);
    const out = await runPipeline(input, { gateway: serverGateway(), setStep, newId: randomUUID });
    await savePipelineOutput(admin, input, out);
    return { ok: true as const, mode: out.mode };
  } catch (e) {
    await admin.from('observation').update({ pipeline_step: `error:${e instanceof Error ? e.message.slice(0, 120) : 'unknown'}` }).eq('id', observationId);
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}
