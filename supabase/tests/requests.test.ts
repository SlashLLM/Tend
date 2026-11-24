import { beforeEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './db';
import { ID, seedWorld } from './fixtures';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await seedWorld(t);
});

// Each test starts with no requests and no observations, so cases never depend on each other.
beforeEach(async () => {
  await t.db.exec(`delete from public.observation_request; delete from public.observation; delete from public.notification;`);
});

const request = async (user: string, note: string | null = 'Thursday story time, please') =>
  (await t.q<{ id: string }>(user, `select public.request_observation($1) as id`, [note]))[0].id;

const schedule = async (leader: string, educator: string, req: string | null = null) =>
  (await t.q<{ id: string }>(leader, `select public.schedule_observation($1, now() + interval '2 days', 20, null, 'Story time', $2) as id`, [educator, req]))[0].id;

const status = async (id: string) =>
  (await t.db.query<{ status: string }>(`select status from public.observation_request where id = $1`, [id])).rows[0].status;

const count = async (user: string, sql: string, params: unknown[] = []) =>
  Number((await t.q<{ n: number }>(user, `select count(*)::int as n from (${sql}) s`, params))[0].n);

describe('educator-initiated observation requests', () => {
  it('an educator requests an observation and their own centre leader is notified', async () => {
    const id = await request(ID.eduA1);
    expect(await count(ID.leaderA, `select 1 from public.observation_request where id = $1`, [id])).toBe(1);
    expect(await count(ID.leaderA, `select 1 from public.notification where kind = 'observation_requested' and payload->>'request_id' = $1`, [id])).toBe(1);
    expect(await count(ID.leaderB, `select 1 from public.notification where kind = 'observation_requested'`)).toBe(0);
  });

  it('only the requester, their centre leader and nobody else can read it', async () => {
    const id = await request(ID.eduA1);
    const visible = (user: string) => count(user, `select 1 from public.observation_request where id = $1`, [id]);
    expect(await visible(ID.eduA1)).toBe(1);
    expect(await visible(ID.leaderA)).toBe(1);
    expect(await visible(ID.eduA2)).toBe(0); // a colleague
    expect(await visible(ID.leaderB)).toBe(0); // another centre
    expect(await visible(ID.outsider)).toBe(0); // another organisation
  });

  it('leaders cannot file requests, and a second open request is refused', async () => {
    await expect(request(ID.leaderA)).rejects.toThrow(/only an educator/);
    await request(ID.eduA1);
    await expect(request(ID.eduA1)).rejects.toThrow(/already have an open request/);
  });

  it('refuses a request while the educator already has an observation coming up', async () => {
    await schedule(ID.leaderA, ID.eduA1);
    await expect(request(ID.eduA1)).rejects.toThrow(/observation coming up/);
  });

  it('rejects an over-long note', async () => {
    await expect(request(ID.eduA1, 'x'.repeat(301))).rejects.toThrow();
  });

  it('nobody can write the table directly', async () => {
    await expect(
      t.q(ID.eduA1, `insert into public.observation_request (org_id, centre_id, educator_id) values ($1, $2, $3)`, [ID.org, ID.centreA, ID.eduA1]),
    ).rejects.toThrow();
    const id = await request(ID.eduA1);
    await expect(t.q(ID.leaderA, `update public.observation_request set status = 'declined' where id = $1`, [id])).rejects.toThrow();
  });
});

describe('scheduling fulfils a request', () => {
  it('links the new observation to the request in one step, and the educator can then ask again later', async () => {
    const id = await request(ID.eduA1);
    const obs = await schedule(ID.leaderA, ID.eduA1, id);
    const row = (await t.db.query<{ status: string; observation_id: string; decided_by: string }>(`select status, observation_id, decided_by from public.observation_request where id = $1`, [id])).rows[0];
    expect(row).toEqual({ status: 'scheduled', observation_id: obs, decided_by: ID.leaderA });
  });

  it('refuses a request that belongs to someone else, or another centre, or is already closed', async () => {
    const id = await request(ID.eduA1);
    await expect(schedule(ID.leaderA, ID.eduA2, id)).rejects.toThrow(/no longer open/); // wrong educator
    await expect(schedule(ID.leaderB, ID.eduB1, id)).rejects.toThrow(/no longer open/); // other centre's leader
    await schedule(ID.leaderA, ID.eduA1, id);
    await t.db.exec(`delete from public.observation`);
    await expect(schedule(ID.leaderA, ID.eduA1, id)).rejects.toThrow(/no longer open/); // already scheduled
    expect(await status(id)).toBe('scheduled');
  });

  it('scheduling without a request still works exactly as before', async () => {
    const obs = await schedule(ID.leaderA, ID.eduA1);
    expect(obs).toMatch(/[0-9a-f-]{36}/);
    await expect(schedule(ID.eduA1, ID.eduA2)).rejects.toThrow(/only a centre leader/);
  });
});

describe('declining and withdrawing', () => {
  it('the centre leader declines and the educator is told; then the educator can ask again', async () => {
    const id = await request(ID.eduA1);
    await t.q(ID.leaderA, `select public.resolve_observation_request($1, 'decline')`, [id]);
    expect(await status(id)).toBe('declined');
    expect(await count(ID.eduA1, `select 1 from public.notification where kind = 'observation_request_declined'`)).toBe(1);
    await expect(request(ID.eduA1)).resolves.toMatch(/[0-9a-f-]{36}/);
  });

  it('the educator can withdraw their own request, but not decline it', async () => {
    const id = await request(ID.eduA1);
    await expect(t.q(ID.eduA1, `select public.resolve_observation_request($1, 'decline')`, [id])).rejects.toThrow(/only a centre leader/);
    await t.q(ID.eduA1, `select public.resolve_observation_request($1, 'withdraw')`, [id]);
    expect(await status(id)).toBe('withdrawn');
  });

  it('a leader cannot withdraw it, other centres cannot decline it, and a closed request stays closed', async () => {
    const id = await request(ID.eduA1);
    await expect(t.q(ID.leaderA, `select public.resolve_observation_request($1, 'withdraw')`, [id])).rejects.toThrow(/only the requesting educator/);
    await expect(t.q(ID.leaderB, `select public.resolve_observation_request($1, 'decline')`, [id])).rejects.toThrow(/only a centre leader/);
    await expect(t.q(ID.eduA1, `select public.resolve_observation_request($1, 'bogus')`, [id])).rejects.toThrow(/unknown action/);
    await t.q(ID.eduA1, `select public.resolve_observation_request($1, 'withdraw')`, [id]);
    await expect(t.q(ID.leaderA, `select public.resolve_observation_request($1, 'decline')`, [id])).rejects.toThrow(/no longer open/);
  });
});
