import { beforeAll, describe, expect, it } from 'vitest';
import { preschoolQuestions } from '@/lib/lna/content';
import { scoreLna, type Answers } from '@/lib/lna/score';
import { buildWorld, toSql, type World } from '../seed/world';
import { createTestDb, type TestDb } from './db';

let t: TestDb;
let w: World;
const P = () => w.ids.people;

beforeAll(async () => {
  t = await createTestDb();
  w = buildWorld(new Date()); // anchor = now so "last 90/180 days" windows line up with SQL now()
  await t.db.exec(toSql(w));
});

const one = async <T,>(user: string, sql: string, params: unknown[] = []) => (await t.q<T>(user, sql, params))[0];

describe('needs analysis → IDP draft', () => {
  it('Mdm Lee starts a needs analysis (idempotent); a leader cannot', async () => {
    const a = await one<{ id: string }>(P().meiling, `select public.start_lna() id`);
    const b = await one<{ id: string }>(P().meiling, `select public.start_lna() id`);
    expect(a.id).toBe(b.id);
    await expect(t.q(w.ids.sandra, `select public.start_lna()`)).rejects.toThrow(/only educators/);
  });

  it('completing it stores the snapshot, creates a draft IDP with mapped goals, and notifies the leader', async () => {
    const { id: attempt } = await one<{ id: string }>(P().meiling, `select public.start_lna() id`);
    const qs = preschoolQuestions();
    const answers: Answers = {};
    for (const q of qs) answers[q.id] = q.type === 'confidence' ? { confidence: 2 } : { level: q.subdomain === '3.4' ? 1 : 2 };
    const snap = scoreLna(qs, answers);
    const { idp } = await one<{ idp: string }>(P().meiling, `select public.complete_lna($1, $2, 'summary') idp`, [attempt, JSON.stringify(snap)]);

    const goals = await t.q<{ code: string; current_level: number; target_level: number; tsc: string | null }>(P().meiling,
      `select i.code, g.current_level, g.target_level, g.tsc_id tsc from public.idp_goal g join public.indicator i on i.id = g.indicator_id where g.idp_id = $1 order by g.position`, [idp]);
    expect(goals).toHaveLength(3);
    expect(goals.map((g) => g.code)).toEqual(snap.suggested_goals.map((g) => g.indicator));
    expect(goals.every((g) => g.tsc)).toBe(true); // skill linked from the fixed map
    const [{ status }] = await t.q<{ status: string }>(P().meiling, `select status from public.idp where id = $1`, [idp]);
    expect(status).toBe('draft');
    const notes = await t.q(w.ids.sandra, `select 1 from public.notification where kind = 'idp_ready_to_cocreate' and payload->>'idp_id' = $1`, [idp]);
    expect(notes).toHaveLength(1);
    await expect(t.q(P().meiling, `select public.complete_lna($1, $2)`, [attempt, JSON.stringify(snap)])).rejects.toThrow(/already completed/);
  });

  it('rejects someone else’s attempt and malformed snapshots', async () => {
    const { id } = await one<{ id: string }>(P().ravi, `select public.start_lna() id`);
    await expect(t.q(P().aisha, `select public.complete_lna($1, '{"suggested_goals":[{"indicator":"3.3.4","current_level":1,"target_level":2}]}')`, [id])).rejects.toThrow(/not your/);
    await expect(t.q(P().ravi, `select public.complete_lna($1, '{"suggested_goals":[]}')`, [id])).rejects.toThrow(/1–3 goals/);
    await expect(t.q(P().ravi, `select public.complete_lna($1, '{"suggested_goals":[{"indicator":"9.9.9","current_level":1,"target_level":2}]}')`, [id])).rejects.toThrow(/unknown indicator/);
  });
});

describe('suggested IDP updates (never automatic)', () => {
  it('approving an observation that sees Aisha at L2 on 3.3.4 proposes raising her target; accepting creates a new version', async () => {
    const aisha = P().aisha;
    const [{ id: obs }] = await t.q<{ id: string }>(w.ids.sandra, `select public.schedule_observation($1, now() - interval '1 hour', 20, null, 'Story time') id`, [aisha]);
    await t.q(w.ids.sandra, `select public.start_capture($1)`, [obs]);
    await t.q(w.ids.sandra, `select public.end_capture($1)`, [obs]);
    // simulate pipeline output (service role)
    await t.db.query(`update public.observation set status = 'ai_draft' where id = $1`, [obs]);
    const ev = (await t.db.query<{ id: string }>(`insert into public.evidence_unit (org_id, observation_id, idx, text) values ($1,$2,0,'asked why and waited') returning id`, [w.ids.org, obs])).rows[0].id;
    await t.db.query(`insert into public.tag (org_id, observation_id, evidence_unit_id, indicator_id, framework_version_id, level, valence, confidence) values ($1,$2,$3,$4,$5,2,'glow',0.9)`,
      [w.ids.org, obs, ev, w.ids.indicators['3.3.4'], w.ids.qttVersion]);
    const before = await one<{ id: string; target: number }>(aisha, `select g.id, g.target_level target from public.idp_goal g join public.idp i on i.id = g.idp_id join public.indicator x on x.id = g.indicator_id where i.educator_id = $1 and i.status = 'active' and x.code = '3.3.4'`, [aisha]);
    expect(before.target).toBe(2);

    await t.q(w.ids.sandra, `select public.approve_and_share($1, $2, 0.05)`, [obs, JSON.stringify({ glows: [{ text: 'x', evidence_ids: [ev] }], grows: [], next_step: { text: 'y', evidence_ids: [ev] } })]);
    const sugg = await t.q<{ id: string; kind: string; payload: { target_level: number } }>(w.ids.sandra, `select id, kind, payload from public.idp_suggestion where observation_id = $1`, [obs]);
    expect(sugg).toHaveLength(1);
    expect(sugg[0]).toMatchObject({ kind: 'raise_target', payload: { target_level: 3 } });

    // nothing changed yet
    const still = await one<{ target: number }>(aisha, `select target_level target from public.idp_goal where id = $1`, [before.id]);
    expect(still.target).toBe(2);
    await expect(t.q(aisha, `select public.decide_idp_suggestion($1, true)`, [sugg[0].id])).rejects.toThrow(/only a centre leader/);

    const { v } = await one<{ v: string }>(w.ids.sandra, `select public.decide_idp_suggestion($1, true) v`, [sugg[0].id]);
    const after = await one<{ target: number; status: string; version: number }>(aisha,
      `select g.target_level target, i.status, i.version from public.idp_goal g join public.idp i on i.id = g.idp_id join public.indicator x on x.id = g.indicator_id where i.id = $1 and x.code = '3.3.4'`, [v]);
    expect(after).toMatchObject({ target: 3, status: 'active' });
    const versions = await t.q<{ status: string }>(aisha, `select status from public.idp where educator_id = $1 order by version`, [aisha]);
    expect(versions.map((x) => x.status)).toEqual(['superseded', 'active']);
    // actions carried over
    const actions = await t.q(aisha, `select 1 from public.idp_action a join public.idp_goal g on g.id = a.idp_goal_id where g.idp_id = $1`, [v]);
    expect(actions.length).toBeGreaterThan(0);
    await expect(t.q(w.ids.sandra, `select public.decide_idp_suggestion($1, false)`, [sugg[0].id])).rejects.toThrow(/already decided/);
  });
});

describe('debrief', () => {
  it('only the leader completes it; actions land in the educator’s IDP; status becomes discussed', async () => {
    const obs = w.ids.nurulDebriefObs;
    const goal = await one<{ id: string }>(P().nurul, `select g.id from public.idp_goal g join public.idp i on i.id = g.idp_id where i.educator_id = $1 and i.status = 'active' limit 1`, [P().nurul]);
    const actions = JSON.stringify([{ goal_id: goal.id, description: 'Try a 3-second wait at story time' }]);
    await expect(t.q(P().nurul, `select public.complete_debrief($1, 'n', $2)`, [obs, actions])).rejects.toThrow(/only a centre leader/);
    const foreignGoal = await one<{ id: string }>(P().aisha, `select g.id from public.idp_goal g join public.idp i on i.id = g.idp_id where i.educator_id = $1 limit 1`, [P().aisha]);
    await expect(t.q(w.ids.sandra, `select public.complete_debrief($1, 'n', $2)`, [obs, JSON.stringify([{ goal_id: foreignGoal.id, description: 'x' }])])).rejects.toThrow(/belong/);
    await t.q(w.ids.sandra, `select public.complete_debrief($1, 'Agreed one step', $2)`, [obs, actions]);
    const o = await one<{ status: string }>(P().nurul, `select status from public.observation where id = $1`, [obs]);
    expect(o.status).toBe('discussed');
    const a = await t.q<{ source: string }>(P().nurul, `select source from public.idp_action where idp_goal_id = $1 and description like 'Try a 3-second%'`, [goal.id]);
    expect(a).toEqual([{ source: 'debrief' }]);
  });
});

describe('coaching', () => {
  it('"Tried it" works only on the educator’s own approved card', async () => {
    const card = await one<{ id: string }>(P().aisha, `select id from public.coaching_card where educator_id = $1 and status = 'approved' limit 1`, [P().aisha]);
    await t.q(P().aisha, `select public.log_strategy_attempt($1, 'Tried during story time')`, [card.id]);
    await expect(t.q(P().ravi, `select public.log_strategy_attempt($1)`, [card.id])).rejects.toThrow(/not available/);
    const draftCard = (await t.db.query<{ id: string }>(`select id from public.coaching_card where status = 'draft' limit 1`)).rows[0];
    const owner = (await t.db.query<{ e: string }>(`select educator_id e from public.coaching_card where id = $1`, [draftCard.id])).rows[0].e;
    await expect(t.q(owner, `select public.log_strategy_attempt($1)`, [draftCard.id])).rejects.toThrow(/not available/);
  });

  it('a leader can open an educator’s coach thread only with an audit entry the educator sees', async () => {
    const [th] = await t.q<{ id: string }>(P().aisha, `insert into public.coach_thread (org_id, educator_id, title) values ($1,$2,'t') returning id`, [w.ids.org, P().aisha]);
    await t.q(P().aisha, `insert into public.coach_message (org_id, thread_id, role, content) values ($1,$2,'user','my K1s go quiet')`, [w.ids.org, th.id]);
    const otherLeader = P().tampines_leader;
    await expect(t.q(otherLeader, `select * from public.leader_open_coach_thread($1)`, [th.id])).rejects.toThrow(/not allowed/);
    const msgs = await t.q<{ content: string }>(w.ids.sandra, `select * from public.leader_open_coach_thread($1)`, [th.id]);
    expect(msgs.map((m) => m.content)).toEqual(['my K1s go quiet']);
    const log = await t.q(P().aisha, `select 1 from public.audit_log where entity = 'coach_thread' and entity_id = $1 and action = 'view_detail'`, [th.id]);
    expect(log).toHaveLength(1);
  });
});

describe('Peer Match', () => {
  it('finds Farah (opted in, seen at L3 on 3.3.4) for Aisha, never Aisha herself or non-opted-in colleagues', async () => {
    const rows = await t.q<{ full_name: string; user_id: string; same_centre: boolean }>(P().aisha, `select * from public.peer_matches('3.3.4')`);
    expect(rows[0]).toMatchObject({ full_name: 'Farah Ismail', same_centre: true });
    expect(rows.find((r) => r.user_id === P().aisha)).toBeUndefined();
    const optIn = (await t.db.query<{ user_id: string }>(`select user_id from public.educator_profile where peer_match_opt_in`)).rows.map((r) => r.user_id);
    for (const r of rows) expect(optIn).toContain(r.user_id);
    expect(rows.length).toBeLessThanOrEqual(5);
  });
});

describe('insights', () => {
  it('centre heatmap: leader only, one row per educator × subdomain with whole levels', async () => {
    const rows = await t.q<{ educator_id: string; subdomain_code: string; latest_level: number; evidence_count: number }>(w.ids.sandra, `select * from public.centre_heatmap($1)`, [w.ids.punggol]);
    expect(new Set(rows.map((r) => r.educator_id)).size).toBeGreaterThanOrEqual(10);
    expect(rows.every((r) => [1, 2, 3].includes(r.latest_level))).toBe(true);
    const keys = rows.map((r) => `${r.educator_id}|${r.subdomain_code}`);
    expect(new Set(keys).size).toBe(keys.length);
    await expect(t.q(P().aisha, `select * from public.centre_heatmap($1)`, [w.ids.punggol])).rejects.toThrow(/not allowed/);
    await expect(t.q(w.ids.hq, `select * from public.centre_heatmap($1)`, [w.ids.punggol])).rejects.toThrow(/not allowed/);
  });

  it('blind spots include 2.1.3 Diversity and the shared 3.4 growth area', async () => {
    const rows = await t.q<{ kind: string; code: string }>(w.ids.sandra, `select * from public.blind_spots($1)`, [w.ids.punggol]);
    expect(rows.some((r) => r.kind === 'no_evidence' && r.code === '2.1.3')).toBe(true);
    expect(rows.some((r) => r.kind === 'shared_growth' && r.code === '3.4')).toBe(true);
    expect(rows.some((r) => r.kind === 'no_evidence' && r.code.startsWith('1.1.'))).toBe(false); // strength area has evidence
  });

  it('HQ network view hides groups under 5 educators and is HQ only (PRD: admin sees no heatmap)', async () => {
    const rows = await t.q<{ centre_name: string; educators: number }>(w.ids.hq, `select * from public.network_heatmap()`);
    expect(new Set(rows.map((r) => r.centre_name))).toEqual(new Set(['Punggol', 'Tampines', 'Jurong West']));
    expect(rows.every((r) => r.educators >= 5)).toBe(true);
    await expect(t.q(w.ids.sandra, `select * from public.network_heatmap()`)).rejects.toThrow(/not allowed/);
    await expect(t.q(w.ids.admin, `select * from public.network_heatmap()`)).rejects.toThrow(/not allowed/);
    // shrink a centre below 5 → it disappears
    await t.db.query(`update public.educator_profile set centre_id = $1 where user_id in (select user_id from public.educator_profile where centre_id = (select id from public.centre where name = 'Jurong West') limit 2)`, [w.ids.punggol]);
    const after = await t.q<{ centre_name: string }>(w.ids.hq, `select * from public.network_heatmap()`);
    expect(after.some((r) => r.centre_name === 'Jurong West')).toBe(false);
  });

  it('Sandbox Metrics: all 7 KPIs with targets; scoped to the leader’s centre', async () => {
    const { m } = await one<{ m: Record<string, { value: number; target?: number }> }>(w.ids.sandra, `select public.sandbox_metrics($1) m`, [w.ids.punggol]);
    for (const k of ['lna_agreement', 'transcription_accuracy', 'documentation_minutes', 'tagging_accuracy', 'interpretation_acceptance', 'strategy_application', 'adoption']) {
      expect(m[k], k).toBeDefined();
    }
    expect(m.tagging_accuracy.value).toBeGreaterThan(0.65);
    expect(m.transcription_accuracy.value).toBeGreaterThan(0.9);
    expect((m.documentation_minutes as unknown as { reduction: number }).reduction).toBeGreaterThan(0.9);
    expect(m.lna_agreement.value).toBeGreaterThan(0.7);
    const tampines = (await t.db.query<{ id: string }>(`select id from public.centre where name = 'Tampines'`)).rows[0].id;
    await expect(t.q(w.ids.sandra, `select public.sandbox_metrics($1)`, [tampines])).rejects.toThrow(/not allowed/);
    await expect(t.q(P().aisha, `select public.sandbox_metrics($1)`, [w.ids.punggol])).rejects.toThrow(/not allowed/);
    const net = await one<{ m: object }>(w.ids.hq, `select public.sandbox_metrics() m`);
    expect(Object.keys(net.m)).toContain('hours_saved_this_term');
  });
});
