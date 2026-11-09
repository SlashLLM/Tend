import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './db';
import { ID, sampleContent, seedActiveIdp, seedAiDraft, seedWorld } from './fixtures';

let t: TestDb;
let goalsA1: string[];
let goalsA2: string[];

beforeAll(async () => {
  t = await createTestDb();
  await seedWorld(t);
  goalsA1 = (await seedActiveIdp(t, ID.eduA1, ID.centreA, [ID.ind334, ID.ind111, ID.ind342])).goals;
  goalsA2 = (await seedActiveIdp(t, ID.eduA2, ID.centreA, [ID.ind334])).goals;
});

async function schedule(leader: string = ID.leaderA, educator: string = ID.eduA1) {
  const rows = await t.q<{ id: string }>(leader, `select public.schedule_observation($1, now() + interval '2 days', 20, null, 'Story time') as id`, [educator]);
  return rows[0].id;
}

/** Scheduled → capturing → processing → ai_draft (pipeline simulated). */
async function draftReady(educator: string = ID.eduA1) {
  const obs = await schedule(ID.leaderA, educator);
  await t.q(ID.leaderA, `select public.start_capture($1)`, [obs]);
  await t.q(ID.leaderA, `select public.end_capture($1)`, [obs]);
  const { ev, tags } = await seedAiDraft(t, obs);
  return { obs, ev, tags };
}

async function approve(obs: string, ev: string, leader: string = ID.leaderA) {
  await t.q(leader, `select public.approve_and_share($1, $2, 0.08, 120000)`, [obs, JSON.stringify(sampleContent(ev))]);
}

const count = async (user: string, sql: string, params: unknown[] = []) =>
  Number((await t.q<{ n: number }>(user, `select count(*)::int as n from (${sql}) s`, params))[0].n);

// ─────────────────────────────────────────────────────────────

describe('migrations', () => {
  it('enables RLS on every public table', async () => {
    const rows = (
      await t.db.query<{ tablename: string }>(
        `select c.relname as tablename from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
      )
    ).rows;
    expect(rows).toEqual([]);
  });

  it('every public table except the root has org_id', async () => {
    const rows = (
      await t.db.query<{ table_name: string }>(
        `select t.table_name from information_schema.tables t
         where t.table_schema = 'public' and t.table_type = 'BASE TABLE' and t.table_name <> 'organisation'
           and not exists (select 1 from information_schema.columns c
                           where c.table_schema = 'public' and c.table_name = t.table_name and c.column_name = 'org_id')`,
      )
    ).rows;
    expect(rows).toEqual([]);
  });
});

describe('organisation isolation', () => {
  it('a user in another organisation sees nothing of ours', async () => {
    await schedule();
    for (const table of ['centre', 'app_user', 'membership', 'observation', 'educator_profile', 'class', 'idp']) {
      const rows = await t.q<{ org_id: string }>(ID.outsider, `select org_id from public.${table}`);
      expect(rows.every((r) => r.org_id === ID.otherOrg), table).toBe(true);
    }
  });

  it('global framework rows are visible to every organisation', async () => {
    expect(await count(ID.outsider, `select 1 from public.indicator`)).toBe(3);
  });

  it('anonymous (no jwt sub) sees no users', async () => {
    const rows = await t.db.transaction(async (tx) => {
      await tx.exec(`set local role authenticated`);
      return (await tx.query(`select * from public.app_user`)).rows;
    });
    expect(rows).toHaveLength(0);
  });
});

describe('scheduling and focus', () => {
  it('a leader schedules for an educator in their own centre and the educator is notified', async () => {
    const obs = await schedule();
    expect(obs).toMatch(/[0-9a-f-]{36}/);
    expect(await count(ID.eduA1, `select 1 from public.notification where payload->>'observation_id' = $1`, [obs])).toBe(1);
  });

  it('educators cannot schedule observations', async () => {
    await expect(schedule(ID.eduA1, ID.eduA2)).rejects.toThrow(/only a centre leader/);
  });

  it('a leader cannot schedule for another centre', async () => {
    await expect(schedule(ID.leaderB, ID.eduA1)).rejects.toThrow(/only a centre leader/);
  });

  it('nobody can insert or update observations directly', async () => {
    await expect(
      t.q(ID.leaderA, `insert into public.observation (org_id, centre_id, educator_id, observer_id, scheduled_at) values ($1,$2,$3,$4,now())`, [
        ID.org, ID.centreA, ID.eduA1, ID.leaderA,
      ]),
    ).rejects.toThrow(/permission denied/);
    const obs = await schedule();
    await expect(t.q(ID.leaderA, `update public.observation set status = 'shared' where id = $1`, [obs])).rejects.toThrow(/permission denied/);
  });

  it('the educator sets up to 2 focus goals from their own IDP', async () => {
    const obs = await schedule();
    await t.q(ID.eduA1, `select public.set_observation_focus($1, $2::uuid[], 'questioning at story time')`, [obs, [goalsA1[0], goalsA1[1]]]);
    const [row] = await t.q<{ focus_goal_ids: string[]; focus_note: string }>(ID.eduA1, `select focus_goal_ids, focus_note from public.observation where id = $1`, [obs]);
    expect(row.focus_goal_ids).toHaveLength(2);
    expect(row.focus_note).toBe('questioning at story time');
  });

  it('rejects 3 focus goals', async () => {
    const obs = await schedule();
    await expect(t.q(ID.eduA1, `select public.set_observation_focus($1, $2::uuid[])`, [obs, goalsA1])).rejects.toThrow(/at most 2/);
  });

  it('rejects focus goals from someone else’s IDP', async () => {
    const obs = await schedule();
    await expect(t.q(ID.eduA1, `select public.set_observation_focus($1, $2::uuid[])`, [obs, [goalsA2[0]]])).rejects.toThrow(/your own IDP/);
  });

  it('another educator cannot set my focus', async () => {
    const obs = await schedule();
    await expect(t.q(ID.eduA2, `select public.set_observation_focus($1, $2::uuid[])`, [obs, [goalsA2[0]]])).rejects.toThrow(/not your observation/);
  });

  it('focus is locked once capture starts', async () => {
    const obs = await schedule();
    await t.q(ID.leaderA, `select public.start_capture($1)`, [obs]);
    await expect(t.q(ID.eduA1, `select public.set_observation_focus($1, $2::uuid[])`, [obs, [goalsA1[0]]])).rejects.toThrow(/before the observation starts/);
  });
});

describe('capture', () => {
  it('raw capture is leader-only and only while capturing', async () => {
    const obs = await schedule();
    const insert = (u: string) =>
      t.q(u, `insert into public.capture_item (org_id, observation_id, kind, seq, text) values ($1,$2,'note',0,'note')`, [ID.org, obs]);
    await expect(insert(ID.leaderA)).rejects.toThrow(/row-level security/);
    await t.q(ID.leaderA, `select public.start_capture($1)`, [obs]);
    await insert(ID.leaderA);
    await expect(insert(ID.eduA1)).rejects.toThrow(/row-level security/);
    expect(await count(ID.eduA1, `select 1 from public.capture_item where observation_id = $1`, [obs])).toBe(0);
    expect(await count(ID.leaderA, `select 1 from public.capture_item where observation_id = $1`, [obs])).toBe(1);
    expect(await count(ID.leaderB, `select 1 from public.capture_item where observation_id = $1`, [obs])).toBe(0);
  });

  it('enforces the status order scheduled → capturing → processing', async () => {
    const obs = await schedule();
    await expect(t.q(ID.leaderA, `select public.end_capture($1)`, [obs])).rejects.toThrow(/not capturing/);
    await t.q(ID.leaderA, `select public.start_capture($1)`, [obs]);
    await t.q(ID.leaderA, `select public.end_capture($1)`, [obs]);
    await expect(t.q(ID.leaderA, `select public.start_capture($1)`, [obs])).rejects.toThrow(/cannot start capture/);
    await expect(t.q(ID.eduA1, `select public.start_capture($1)`, [obs])).rejects.toThrow(/not allowed/);
  });
});

describe('APPROVAL GATE', () => {
  it('the educator sees nothing AI-written before approval', async () => {
    const { obs } = await draftReady();
    for (const table of ['narrative', 'tag', 'evidence_unit', 'coaching_card']) {
      expect(await count(ID.eduA1, `select 1 from public.${table} where observation_id = $1`, [obs]), table).toBe(0);
    }
    // The leader does see the draft.
    expect(await count(ID.leaderA, `select 1 from public.narrative where observation_id = $1`, [obs])).toBe(1);
    expect(await count(ID.leaderA, `select 1 from public.tag where observation_id = $1`, [obs])).toBe(2);
  });

  it('only the centre leader can approve', async () => {
    const { obs, ev } = await draftReady();
    await expect(approve(obs, ev, ID.eduA1)).rejects.toThrow(/only a centre leader/);
    await expect(approve(obs, ev, ID.leaderB)).rejects.toThrow(/only a centre leader/);
    await expect(approve(obs, ev, ID.outsider)).rejects.toThrow(/only a centre leader/);
    await expect(approve(obs, ev, ID.hq)).rejects.toThrow(/only a centre leader/);
  });

  it('cannot approve before a draft exists, or twice', async () => {
    const obs = await schedule();
    await expect(t.q(ID.leaderA, `select public.approve_and_share($1, $2, 0)`, [obs, JSON.stringify(sampleContent(obs))])).rejects.toThrow(/nothing to approve/);
    const d = await draftReady();
    await approve(d.obs, d.ev);
    await expect(approve(d.obs, d.ev)).rejects.toThrow(/nothing to approve/);
  });

  it('rejects malformed feedback and bad edit ratios', async () => {
    const { obs, ev } = await draftReady();
    await expect(t.q(ID.leaderA, `select public.approve_and_share($1, '{"glows":[]}'::jsonb, 0)`, [obs])).rejects.toThrow(/must contain/);
    await expect(t.q(ID.leaderA, `select public.approve_and_share($1, $2, 1.5)`, [obs, JSON.stringify(sampleContent(ev))])).rejects.toThrow(/edit_ratio/);
  });

  it('educators cannot write narratives; leaders can only add non-final versions during review', async () => {
    const { obs, ev } = await draftReady();
    const ins = (u: string, final = false) =>
      t.q(u, `insert into public.narrative (org_id, observation_id, version, author, content, is_final, created_by) values ($1,$2,9,'leader',$3,$4,$5)`, [
        ID.org, obs, JSON.stringify(sampleContent(ev)), final, u,
      ]);
    await expect(ins(ID.eduA1)).rejects.toThrow(/row-level security/);
    await expect(ins(ID.leaderA, true)).rejects.toThrow(/row-level security/);
    await ins(ID.leaderA);
  });

  it('after approval the educator still sees nothing until they reflect', async () => {
    const { obs, ev } = await draftReady();
    await approve(obs, ev);
    expect(await count(ID.eduA1, `select 1 from public.narrative where observation_id = $1`, [obs])).toBe(0);
    await expect(t.q(ID.eduA1, `select public.respond_to_feedback($1, 'agree', 'grow:0')`, [obs])).rejects.toThrow(/reflect first/);
  });

  it('after reflecting, the educator sees only the final narrative, accepted tags and approved cards', async () => {
    const { obs, ev } = await draftReady();
    await approve(obs, ev);
    await t.q(ID.eduA1, `select public.submit_reflection($1, 'The children were quiet when I asked why.')`, [obs]);

    const narr = await t.q<{ author: string; is_final: boolean }>(ID.eduA1, `select author, is_final from public.narrative where observation_id = $1`, [obs]);
    expect(narr).toEqual([{ author: 'leader', is_final: true }]);

    // 0.86 confidence tag accepted, 0.40 "possible" tag dropped
    const tags = await t.q<{ confidence: string }>(ID.eduA1, `select confidence from public.tag where observation_id = $1`, [obs]);
    expect(tags.map((r) => Number(r.confidence))).toEqual([0.86]);
    expect(await count(ID.eduA1, `select 1 from public.coaching_card where observation_id = $1`, [obs])).toBe(1);
    expect(await count(ID.eduA1, `select 1 from public.evidence_unit where observation_id = $1`, [obs])).toBe(1);

    // a colleague never sees it
    expect(await count(ID.eduA2, `select 1 from public.narrative where observation_id = $1`, [obs])).toBe(0);
    expect(await count(ID.eduA2, `select 1 from public.observation where id = $1`, [obs])).toBe(0);
  });

  it('records who approved, the edit ratio and an audit entry the educator can see', async () => {
    const { obs, ev } = await draftReady();
    await approve(obs, ev);
    const [o] = await t.q<{ approved_by: string; edit_ratio: string; status: string }>(ID.leaderA, `select approved_by, edit_ratio, status from public.observation where id = $1`, [obs]);
    expect(o).toMatchObject({ approved_by: ID.leaderA, status: 'shared' });
    expect(Number(o.edit_ratio)).toBeCloseTo(0.08);
    expect(await count(ID.eduA1, `select 1 from public.audit_log where entity_id = $1 and action = 'approve_share'`, [obs])).toBe(1);
  });

  it('tags are locked after sharing', async () => {
    const { obs, ev, tags } = await draftReady();
    await t.q(ID.leaderA, `select public.review_tag($1, 'change_level', 3)`, [tags[0]]);
    await approve(obs, ev);
    await expect(t.q(ID.leaderA, `select public.review_tag($1, 'reject')`, [tags[0]])).rejects.toThrow(/locked/);
    await expect(t.q(ID.leaderA, `select public.add_tag($1, $2, 2, 'glow')`, [obs, ID.ind111])).rejects.toThrow(/locked/);
  });
});

describe('tag review', () => {
  it('logs every tag action and only leaders may do it', async () => {
    const { obs, tags } = await draftReady();
    await t.q(ID.leaderA, `select public.review_tag($1, 'accept')`, [tags[0]]);
    await t.q(ID.leaderA, `select public.review_tag($1, 'reject')`, [tags[1]]);
    await t.q(ID.leaderA, `select public.add_tag($1, $2, 1, 'grow')`, [obs, ID.ind111]);
    await expect(t.q(ID.eduA1, `select public.review_tag($1, 'accept')`, [tags[0]])).rejects.toThrow(/not allowed/);
    await expect(t.q(ID.leaderA, `select public.review_tag($1, 'change_level', 4)`, [tags[0]])).rejects.toThrow(/1–3/);
    await expect(t.q(ID.leaderA, `select public.review_tag($1, 'explode')`, [tags[0]])).rejects.toThrow(/unknown action/);
    const ev = await t.q<{ action: string }>(ID.leaderA, `select e.action from public.tag_event e join public.tag g on g.id = e.tag_id where g.observation_id = $1 order by e.created_at`, [obs]);
    expect(ev.map((e) => e.action).sort()).toEqual(['accept', 'add', 'reject']);
  });
});

describe('educator response', () => {
  it('reflection only once, after sharing, by the owner; responding acknowledges', async () => {
    const { obs, ev } = await draftReady();
    await expect(t.q(ID.eduA1, `select public.submit_reflection($1, 'early')`, [obs])).rejects.toThrow(/not been shared/);
    await approve(obs, ev);
    await expect(t.q(ID.eduA2, `select public.submit_reflection($1, 'hi')`, [obs])).rejects.toThrow(/not your observation/);
    await expect(t.q(ID.eduA1, `select public.submit_reflection($1, '   ')`, [obs])).rejects.toThrow(/empty/);
    await t.q(ID.eduA1, `select public.submit_reflection($1, 'It went OK')`, [obs]);
    await expect(t.q(ID.eduA1, `select public.submit_reflection($1, 'again')`, [obs])).rejects.toThrow(/already/);
    await expect(t.q(ID.eduA1, `select public.respond_to_feedback($1, 'thumbs', null, null, 'sideways')`, [obs])).rejects.toThrow(/up or down/);
    await expect(t.q(ID.eduA1, `select public.respond_to_feedback($1, 'context', 'grow:0', '')`, [obs])).rejects.toThrow(/empty/);
    await t.q(ID.eduA1, `select public.respond_to_feedback($1, 'context', 'grow:0', 'Two children were new that day')`, [obs]);
    const [o] = await t.q<{ status: string }>(ID.eduA1, `select status from public.observation where id = $1`, [obs]);
    expect(o.status).toBe('acknowledged');
    // the leader sees the reflection + context for the debrief
    expect(await count(ID.leaderA, `select 1 from public.educator_response where observation_id = $1`, [obs])).toBe(2);
    expect(await count(ID.leaderB, `select 1 from public.educator_response where observation_id = $1`, [obs])).toBe(0);
  });
});

describe('private data', () => {
  it('private reflections are never visible to leaders, HQ or colleagues', async () => {
    await t.q(ID.eduA1, `insert into public.reflection (org_id, centre_id, educator_id, visibility, body) values ($1,$2,$3,'private','private thought')`, [ID.org, ID.centreA, ID.eduA1]);
    await t.q(ID.eduA1, `insert into public.reflection (org_id, centre_id, educator_id, visibility, body) values ($1,$2,$3,'shared','shared thought')`, [ID.org, ID.centreA, ID.eduA1]);
    expect(await count(ID.eduA1, `select 1 from public.reflection`)).toBe(2);
    const leaderSees = await t.q<{ body: string }>(ID.leaderA, `select body from public.reflection`);
    expect(leaderSees.map((r) => r.body)).toEqual(['shared thought']);
    for (const u of [ID.hq, ID.admin, ID.eduA2, ID.leaderB]) expect(await count(u, `select 1 from public.reflection`), u).toBe(0);
  });

  it('an educator cannot write a reflection as someone else', async () => {
    await expect(
      t.q(ID.eduA2, `insert into public.reflection (org_id, centre_id, educator_id, body) values ($1,$2,$3,'x')`, [ID.org, ID.centreA, ID.eduA1]),
    ).rejects.toThrow(/row-level security/);
  });

  it('coach chats are visible only to the educator', async () => {
    const [th] = await t.q<{ id: string }>(ID.eduA1, `insert into public.coach_thread (org_id, educator_id, title) values ($1,$2,'K1 questions') returning id`, [ID.org, ID.eduA1]);
    await t.q(ID.eduA1, `insert into public.coach_message (org_id, thread_id, role, content) values ($1,$2,'user','my K1s go quiet')`, [ID.org, th.id]);
    await expect(
      t.q(ID.eduA1, `insert into public.coach_message (org_id, thread_id, role, content) values ($1,$2,'assistant','spoofed')`, [ID.org, th.id]),
    ).rejects.toThrow(/row-level security/);
    for (const u of [ID.leaderA, ID.hq, ID.eduA2]) {
      expect(await count(u, `select 1 from public.coach_message`), u).toBe(0);
      expect(await count(u, `select 1 from public.coach_thread`), u).toBe(0);
    }
  });

  it('the class roster (child names) is leader-only', async () => {
    expect(await count(ID.eduA1, `select 1 from public.class_roster`)).toBe(0);
    expect(await count(ID.leaderA, `select 1 from public.class_roster`)).toBe(2);
    expect(await count(ID.leaderB, `select 1 from public.class_roster`)).toBe(0);
  });

  it('ai_run telemetry is hidden from educators and leaders', async () => {
    await t.db.query(`insert into public.ai_run (org_id, task, provider, model, prompt_version, ok) values ($1,'tag','openai','gpt-6-luna','v1',true)`, [ID.org]);
    expect(await count(ID.eduA1, `select 1 from public.ai_run`)).toBe(0);
    expect(await count(ID.leaderA, `select 1 from public.ai_run`)).toBe(0);
    expect(await count(ID.hq, `select 1 from public.ai_run`)).toBe(1);
  });
});

describe('audit log', () => {
  it('educators see who accessed their records; the log is append-only for everyone', async () => {
    await t.q(ID.leaderA, `select public.log_access($1, 'coach_thread', null, 'view')`, [ID.eduA1]);
    expect(await count(ID.eduA1, `select 1 from public.audit_log where action = 'view'`)).toBeGreaterThanOrEqual(1);
    expect(await count(ID.eduA2, `select 1 from public.audit_log where subject_user_id = $1`, [ID.eduA1])).toBe(0);
    await expect(t.q(ID.admin, `delete from public.audit_log`)).rejects.toThrow(/permission denied/);
    await expect(t.db.query(`update public.audit_log set action = 'x'`)).rejects.toThrow(/append-only/);
    await expect(t.db.query(`delete from public.audit_log`)).rejects.toThrow(/append-only/);
  });
});

describe('IDP', () => {
  async function draftIdp(educator: string = ID.eduA2, goals = 1, centre: string = educator === ID.eduB1 ? ID.centreB : ID.centreA) {
    const [idp] = await t.q<{ id: string }>(educator, `insert into public.idp (org_id, centre_id, educator_id, created_by) values ($1,$2,$3,$3) returning id`, [ID.org, centre, educator]);
    for (let i = 0; i < goals; i++) {
      await t.q(educator, `insert into public.idp_goal (org_id, idp_id, indicator_id, framework_version_id, current_level, target_level, position) values ($1,$2,$3,$4,1,2,$5)`, [
        ID.org, idp.id, ID.ind111, ID.qttV1, i,
      ]);
    }
    return idp.id;
  }

  it('becomes active only when both educator and leader confirm', async () => {
    const idp = await draftIdp();
    expect((await t.q<{ r: string }>(ID.eduA2, `select public.confirm_idp($1) as r`, [idp]))[0].r).toBe('draft');
    expect((await t.q<{ r: string }>(ID.leaderA, `select public.confirm_idp($1) as r`, [idp]))[0].r).toBe('active');
    await expect(t.q(ID.leaderA, `select public.confirm_idp($1)`, [idp])).rejects.toThrow(/only a draft/);
  });

  it('goals cannot be edited once the IDP is active', async () => {
    const idp = await draftIdp();
    await t.q(ID.eduA2, `select public.confirm_idp($1)`, [idp]);
    await t.q(ID.leaderA, `select public.confirm_idp($1)`, [idp]);
    await t.q(ID.eduA2, `update public.idp_goal set target_level = 3 where idp_id = $1`, [idp]);
    const [g] = await t.q<{ target_level: number }>(ID.eduA2, `select target_level from public.idp_goal where idp_id = $1`, [idp]);
    expect(g.target_level).toBe(2); // RLS silently filtered the update
  });

  it('a new confirmed version supersedes the previous active one', async () => {
    const v1 = await draftIdp(ID.eduB1);
    await t.q(ID.eduB1, `select public.confirm_idp($1)`, [v1]);
    await t.q(ID.leaderB, `select public.confirm_idp($1)`, [v1]);
    const [{ lineage_id }] = await t.q<{ lineage_id: string }>(ID.eduB1, `select lineage_id from public.idp where id = $1`, [v1]);
    const [v2] = await t.q<{ id: string }>(ID.eduB1, `insert into public.idp (org_id, centre_id, educator_id, lineage_id, version) values ($1,$2,$3,$4,2) returning id`, [ID.org, ID.centreB, ID.eduB1, lineage_id]);
    await t.q(ID.eduB1, `insert into public.idp_goal (org_id, idp_id, indicator_id, framework_version_id, target_level) values ($1,$2,$3,$4,3)`, [ID.org, v2.id, ID.ind334, ID.qttV1]);
    await t.q(ID.eduB1, `select public.confirm_idp($1)`, [v2.id]);
    await t.q(ID.leaderB, `select public.confirm_idp($1)`, [v2.id]);
    const rows = await t.q<{ version: number; status: string }>(ID.eduB1, `select version, status from public.idp where lineage_id = $1 order by version`, [lineage_id]);
    expect(rows).toEqual([{ version: 1, status: 'superseded' }, { version: 2, status: 'active' }]);
  });

  it('rejects empty IDPs and more than 3 goals', async () => {
    const empty = await draftIdp(ID.eduA2, 0);
    await expect(t.q(ID.eduA2, `select public.confirm_idp($1)`, [empty])).rejects.toThrow(/at least one goal/);
    const big = await draftIdp(ID.eduA2, 4);
    await expect(t.q(ID.eduA2, `select public.confirm_idp($1)`, [big])).rejects.toThrow(/at most 3/);
  });

  it('an IDP cannot be inserted pre-confirmed or for another educator', async () => {
    await expect(
      t.q(ID.eduA2, `insert into public.idp (org_id, centre_id, educator_id, status) values ($1,$2,$3,'active')`, [ID.org, ID.centreA, ID.eduA2]),
    ).rejects.toThrow(/row-level security/);
    await expect(
      t.q(ID.eduA2, `insert into public.idp (org_id, centre_id, educator_id) values ($1,$2,$3)`, [ID.org, ID.centreA, ID.eduA1]),
    ).rejects.toThrow(/row-level security/);
    await expect(
      t.q(ID.eduA2, `select public.confirm_idp(id) from public.idp where educator_id = $1`, [ID.eduA1]),
    ).resolves.toEqual([]); // cannot even see it
  });

  it('only a leader can endorse an IDP action', async () => {
    const goal = goalsA1[0];
    const [a] = await t.q<{ id: string }>(ID.eduA1, `insert into public.idp_action (org_id, idp_goal_id, description, source, status) values ($1,$2,'NIEC course','pathway','proposed') returning id`, [ID.org, goal]);
    await expect(t.q(ID.eduA1, `update public.idp_action set endorsed_by = $2, status = 'open' where id = $1`, [a.id, ID.eduA1])).rejects.toThrow(/only a centre leader/);
    await expect(t.q(ID.leaderA, `update public.idp_action set endorsed_by = $2 where id = $1`, [a.id, ID.eduA1])).rejects.toThrow(/only a centre leader/);
    await t.q(ID.leaderA, `update public.idp_action set endorsed_by = $2, status = 'open' where id = $1`, [a.id, ID.leaderA]);
    expect(await count(ID.leaderB, `select 1 from public.idp_action where id = $1`, [a.id])).toBe(0);
  });
});

describe('needs analysis', () => {
  it('educators own their attempt; answers lock after completion; leaders can read', async () => {
    const [tpl] = (
      await t.db.query<{ id: string }>(`insert into public.lna_template (org_id, age_group, framework_version_id, questions) values (null,'preschool',$1,'[]') returning id`, [ID.qttV1])
    ).rows;
    const [att] = await t.q<{ id: string }>(ID.eduA1, `insert into public.lna_attempt (org_id, centre_id, educator_id, template_id) values ($1,$2,$3,$4) returning id`, [ID.org, ID.centreA, ID.eduA1, tpl.id]);
    await t.q(ID.eduA1, `insert into public.lna_answer (attempt_id, org_id, question_id, answer) values ($1,$2,'q1','{"level":2}')`, [att.id, ID.org]);
    await expect(
      t.q(ID.eduA2, `insert into public.lna_answer (attempt_id, org_id, question_id, answer) values ($1,$2,'q2','{}')`, [att.id, ID.org]),
    ).rejects.toThrow(/row-level security/);
    await t.q(ID.eduA1, `update public.lna_attempt set status = 'completed', completed_at = now() where id = $1`, [att.id]);
    await expect(
      t.q(ID.eduA1, `insert into public.lna_answer (attempt_id, org_id, question_id, answer) values ($1,$2,'q3','{}')`, [att.id, ID.org]),
    ).rejects.toThrow(/row-level security/);
    expect(await count(ID.leaderA, `select 1 from public.lna_answer where attempt_id = $1`, [att.id])).toBe(1);
    expect(await count(ID.leaderB, `select 1 from public.lna_answer where attempt_id = $1`, [att.id])).toBe(0);
  });
});

describe('framework registry', () => {
  it('educators and leaders cannot edit; HQ edits only its own organisation’s rows', async () => {
    const ins = (u: string, org: string | null) =>
      t.q(u, `insert into public.pd_activity (org_id, tier, title) values ($1,'internal','Story-time PLC')`, [org]);
    await expect(ins(ID.eduA1, ID.org)).rejects.toThrow(/row-level security/);
    await expect(ins(ID.leaderA, ID.org)).rejects.toThrow(/row-level security/);
    await ins(ID.hq, ID.org);
    await expect(ins(ID.hq, null)).rejects.toThrow(/row-level security/); // global catalogue is service-only
    await expect(ins(ID.hq, ID.otherOrg)).rejects.toThrow(/row-level security/);
    await t.q(ID.hq, `update public.indicator set name = 'hacked' where id = $1`, [ID.ind334]);
    const [i] = (await t.db.query<{ name: string }>(`select name from public.indicator where id = $1`, [ID.ind334])).rows;
    expect(i.name).toBe('Extending Thinking Through Questioning');
  });
});
