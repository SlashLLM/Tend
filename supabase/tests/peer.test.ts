import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './db';
import { ID, seedActiveIdp, seedWorld } from './fixtures';

/** Migration 0008: marking actions done, and Peer Match as a tracked 15-minute peer observation. */
let t: TestDb;
let goal: string;

beforeAll(async () => {
  t = await createTestDb();
  await seedWorld(t);
  ({ goals: [goal] } = await seedActiveIdp(t, ID.eduA1, ID.centreA, [ID.ind334]));
});

beforeEach(async () => {
  await t.db.exec(`delete from public.peer_observation; delete from public.idp_action; delete from public.notification;`);
});

/** An action on Aisha's 3.3.4 goal, inserted as the service role. */
const action = async (o: { status?: string; peer?: string | null; description?: string } = {}) =>
  (
    await t.db.query<{ id: string }>(
      `insert into public.idp_action (org_id, idp_goal_id, description, source, status, peer_user_id)
       values ($1, $2, $3, 'pathway', $4, $5) returning id`,
      [ID.org, goal, o.description ?? 'Watch Farah Lim for 15 minutes', o.status ?? 'open', o.peer === undefined ? ID.eduA2 : o.peer],
    )
  ).rows[0].id;

const actionRow = async (id: string) =>
  (await t.db.query<{ status: string; completed_at: string | null; completion_note: string | null; cpd_minutes: number | null }>(
    `select status, completed_at, completion_note, cpd_minutes from public.idp_action where id = $1`, [id])).rows[0];
const session = async (id: string) =>
  (await t.db.query<{ status: string; scheduled_at: string | null; noticed: string | null }>(`select status, scheduled_at, noticed from public.peer_observation where id = $1`, [id])).rows[0];
const notes = async (user: string, kind: string) =>
  Number((await t.db.query<{ n: number }>(`select count(*)::int n from public.notification where user_id = $1 and kind = $2`, [user, kind])).rows[0].n);
const ask = async (act: string, when: string | null = null, note: string | null = 'Story time?') =>
  (await t.q<{ id: string }>(ID.eduA1, `select public.request_peer_observation($1, $2::timestamptz, $3) as id`, [act, when, note]))[0].id;

describe('mark an action done', () => {
  it('the owner marks an endorsed action done with a note, and can undo it', async () => {
    const a = await action({ peer: null, description: 'Practise wait time weekly' });
    await t.q(ID.eduA1, `select public.complete_action($1, 'Tried it at story time')`, [a]);
    expect(await actionRow(a)).toMatchObject({ status: 'done', completion_note: 'Tried it at story time' });
    expect((await actionRow(a)).completed_at).not.toBeNull();
    await t.q(ID.eduA1, `select public.reopen_action($1)`, [a]);
    expect(await actionRow(a)).toMatchObject({ status: 'open', completed_at: null, completion_note: null });
  });

  it('a proposed (not yet endorsed) action cannot be marked done', async () => {
    const a = await action({ peer: null, status: 'proposed' });
    await expect(t.q(ID.eduA1, `select public.complete_action($1)`, [a])).rejects.toThrow(/endorsed/);
  });

  it('nobody else can mark it done, not even the leader', async () => {
    const a = await action({ peer: null });
    for (const u of [ID.leaderA, ID.eduA2]) await expect(t.q(u, `select public.complete_action($1)`, [a])).rejects.toThrow(/not your action/);
  });

  it('a peer action completes through its reflection, not the plain button', async () => {
    const a = await action();
    await expect(t.q(ID.eduA1, `select public.complete_action($1)`, [a])).rejects.toThrow(/record what you noticed/);
  });
});

describe('peer observation', () => {
  it('only after the leader endorses it can the educator ask, and the colleague is notified', async () => {
    const proposed = await action({ status: 'proposed' });
    await expect(ask(proposed)).rejects.toThrow(/endorse/);
    const a = await action();
    const id = await ask(a);
    expect(await session(id)).toMatchObject({ status: 'requested' });
    expect(await notes(ID.eduA2, 'peer_observation_requested')).toBe(1);
    await expect(ask(a)).rejects.toThrow(/already asked/);
  });

  it('cannot ask a colleague who has not opted in to Peer Match', async () => {
    const a = await action({ peer: ID.eduB1 }); // opted out in the fixtures
    await expect(ask(a)).rejects.toThrow(/not available/);
  });

  it('only the colleague answers; accepting needs a time, theirs or the proposed one', async () => {
    const a = await action();
    const id = await ask(a);
    await expect(t.q(ID.eduA1, `select public.respond_peer_observation($1, true, now() + interval '1 day')`, [id])).rejects.toThrow(/not your request/);
    await expect(t.q(ID.eduA2, `select public.respond_peer_observation($1, true)`, [id])).rejects.toThrow(/choose a time/);
    await t.q(ID.eduA2, `select public.respond_peer_observation($1, true, now() + interval '2 days', 'K1 Sunflower at 10')`, [id]);
    expect((await session(id)).status).toBe('accepted');
    expect(await notes(ID.eduA1, 'peer_observation_accepted')).toBe(1);

    const b = await action({ description: 'second' });
    await t.db.query(`update public.peer_observation set status = 'cancelled' where id = $1`, [id]);
    const id2 = await ask(b, new Date(Date.now() + 86_400_000).toISOString());
    await t.q(ID.eduA2, `select public.respond_peer_observation($1, true)`, [id2]); // proposed time is used
    expect((await session(id2)).scheduled_at).not.toBeNull();
  });

  it('a decline lets the educator ask again', async () => {
    const a = await action();
    const id = await ask(a);
    await t.q(ID.eduA2, `select public.respond_peer_observation($1, false, null, 'Busy with the concert this week')`, [id]);
    expect(await notes(ID.eduA1, 'peer_observation_declined')).toBe(1);
    expect(await session(await ask(a))).toMatchObject({ status: 'requested' });
  });

  it('the reflection completes the action, logs 15 CPD minutes and thanks the colleague, but only after the session', async () => {
    const a = await action();
    const id = await ask(a);
    await t.q(ID.eduA2, `select public.respond_peer_observation($1, true, now() + interval '2 days')`, [id]);
    const reflect = () => t.q(ID.eduA1, `select public.complete_peer_observation($1, 'She waited five seconds after every question.', 'Count to five')`, [id]);
    await expect(reflect()).rejects.toThrow(/after the session/);
    await t.db.query(`update public.peer_observation set scheduled_at = now() - interval '10 minutes' where id = $1`, [id]);
    await expect(t.q(ID.eduA1, `select public.complete_peer_observation($1, 'ok', 'x')`, [id])).rejects.toThrow(/sentence/);
    await reflect();
    expect(await session(id)).toMatchObject({ status: 'done', noticed: 'She waited five seconds after every question.' });
    expect(await actionRow(a)).toMatchObject({ status: 'done', cpd_minutes: 15 });
    expect(await notes(ID.eduA2, 'peer_observation_thanks')).toBe(1);
    await expect(t.q(ID.eduA1, `select public.reopen_action($1)`, [a])).rejects.toThrow(/cannot be undone/);
  });

  it('the observer can cancel; the colleague is told', async () => {
    const id = await ask(await action());
    await expect(t.q(ID.eduA2, `select public.cancel_peer_observation($1)`, [id])).rejects.toThrow(/not your request/);
    await t.q(ID.eduA1, `select public.cancel_peer_observation($1)`, [id]);
    expect((await session(id)).status).toBe('cancelled');
    expect(await notes(ID.eduA2, 'peer_observation_cancelled')).toBe(1);
  });

  it('only the two educators and the observer’s centre leader can see it; no direct writes', async () => {
    const id = await ask(await action());
    const sees = async (u: string) => (await t.q(u, `select 1 from public.peer_observation where id = $1`, [id])).length;
    for (const u of [ID.eduA1, ID.eduA2, ID.leaderA]) expect(await sees(u), u).toBe(1);
    for (const u of [ID.leaderB, ID.eduB1, ID.hq, ID.admin, ID.outsider]) expect(await sees(u), u).toBe(0);
    await expect(t.q(ID.eduA1, `update public.peer_observation set status = 'done' where id = $1`, [id])).rejects.toThrow(/permission denied/);
  });

  it('a plan revision keeps the action’s peer, tracking fields and its session', async () => {
    const a = await action();
    const id = await ask(a);
    const idp = (await t.db.query<{ idp_id: string }>(`select idp_id from public.idp_goal where id = $1`, [goal])).rows[0].idp_id;
    const sugg = (await t.db.query<{ id: string }>(
      `insert into public.idp_suggestion (org_id, idp_id, idp_goal_id, kind, payload) values ($1, $2, $3, 'raise_target', '{"target_level": 3}') returning id`,
      [ID.org, idp, goal])).rows[0].id;
    await t.q(ID.leaderA, `select public.decide_idp_suggestion($1, true)`, [sugg]);
    const moved = (await t.db.query<{ peer_user_id: string; status: string; superseded: boolean }>(
      `select a.peer_user_id, a.status, (i.status = 'superseded') superseded from public.peer_observation p
         join public.idp_action a on a.id = p.idp_action_id join public.idp_goal g on g.id = a.idp_goal_id join public.idp i on i.id = g.idp_id
        where p.id = $1`, [id])).rows[0];
    expect(moved).toEqual({ peer_user_id: ID.eduA2, status: 'open', superseded: false });
  });
});
