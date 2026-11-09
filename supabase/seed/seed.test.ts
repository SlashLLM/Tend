import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../tests/db';
import { COURSES, INTERNAL_ACTIVITIES, QTT, SUBDOMAIN_TO_TSC, flatIndicators } from './registry';
import { buildWorld, toSql, type World } from './world';

const ANCHOR = new Date('2026-11-06T02:00:00Z');
const TONE_WORDS = ['failed', 'poor', 'weak', 'lacks', 'unable', 'should have', 'wrong', 'never', 'always', 'careless', 'inadequate', 'below standard'];

describe('qtt_framework.json (Appendix A)', () => {
  const flat = flatIndicators();

  it('has 3 domains, 8 subdomains and 46 indicators', () => {
    expect(QTT.domains).toHaveLength(3);
    expect(QTT.domains.flatMap((d) => d.subdomains)).toHaveLength(8);
    expect(flat).toHaveLength(46);
  });

  it('matches the Appendix A count per subdomain', () => {
    const per = Object.fromEntries(QTT.domains.flatMap((d) => d.subdomains).map((s) => [s.code, s.indicators.length]));
    expect(per).toEqual({ '1.1': 5, '2.1': 3, '2.2': 7, '2.3': 6, '3.1': 6, '3.2': 6, '3.3': 8, '3.4': 5 });
  });

  it('codes are unique, well-formed and nested under their subdomain', () => {
    const codes = flat.map((i) => i.code);
    expect(new Set(codes).size).toBe(46);
    for (const i of flat) {
      expect(i.code).toMatch(/^\d\.\d\.\d$/);
      expect(i.code.startsWith(`${i.subdomain_code}.`)).toBe(true);
      expect(i.subdomain_code.startsWith(`${i.domain_code}.`)).toBe(true);
    }
  });

  it('spot-checks official names from Appendix A', () => {
    const byCode = Object.fromEntries(flat.map((i) => [i.code, i.name]));
    expect(byCode['3.3.4']).toBe('Extending Thinking Through Questioning');
    expect(byCode['2.1.3']).toBe('Encouraging Awareness, Respect and Celebration of Diversity');
    expect(byCode['3.4.5']).toBe('Guiding Children in Planning and Organising to Achieve a Goal');
    expect(byCode['1.1.1']).toBe('Creating a Warm, Safe and Motivating Environment');
  });

  it('every indicator has 3 level descriptors and at least 3 look-fors', () => {
    for (const i of flat) {
      expect(Object.keys(i.levels).sort(), i.code).toEqual(['1', '2', '3']);
      for (const l of Object.values(i.levels)) expect(l.length, i.code).toBeGreaterThan(10);
      expect(i.look_fors.length, i.code).toBeGreaterThanOrEqual(3);
    }
  });

  it('contains no judgemental Tone Guard words', () => {
    const text = JSON.stringify(QTT).toLowerCase();
    for (const w of TONE_WORDS) expect(text.includes(` ${w} `), w).toBe(false);
  });

  it('every subdomain maps to a Skills Framework skill (gap→skill is fixed data)', () => {
    for (const s of QTT.domains.flatMap((d) => d.subdomains)) expect(SUBDOMAIN_TO_TSC[s.code], s.code).toBeTruthy();
  });

  it('course catalogue: 20 courses + 10 internal activities, every indicator code real', () => {
    expect(COURSES).toHaveLength(20);
    expect(INTERNAL_ACTIVITIES).toHaveLength(10);
    const codes = new Set(flat.map((i) => i.code));
    for (const a of [...COURSES, ...INTERNAL_ACTIVITIES]) for (const c of a.indicator_codes) expect(codes.has(c), `${a.title}: ${c}`).toBe(true);
    // every subdomain has at least one pathway option
    for (const s of Object.keys(SUBDOMAIN_TO_TSC)) {
      expect([...COURSES, ...INTERNAL_ACTIVITIES].some((a) => a.subdomain_codes.includes(s)), s).toBe(true);
    }
  });
});

describe('buildWorld (pure)', () => {
  const w = buildWorld(ANCHOR);
  const rows = (t: string) => w.tables.find(([n]) => n === t)?.[1] ?? [];

  it('is deterministic for the same anchor', () => {
    expect(toSql(buildWorld(ANCHOR))).toBe(toSql(w));
  });

  it('has Punggol with Sandra and exactly 15 educators', () => {
    const punggolEducators = rows('membership').filter((m) => m.centre_id === w.ids.punggol && m.role === 'educator');
    expect(punggolEducators).toHaveLength(15);
    const sandra = rows('app_user').find((u) => u.id === w.ids.sandra);
    expect(sandra?.full_name).toBe('Sandra Tan');
  });

  it('has about 120 past Punggol observations across ~2 terms', () => {
    const past = rows('observation').filter((o) => o.centre_id === w.ids.punggol && o.status !== 'scheduled');
    expect(past.length).toBeGreaterThanOrEqual(110);
    expect(past.length).toBeLessThanOrEqual(130);
    const oldest = Math.min(...past.map((o) => (o.scheduled_at as Date).getTime()));
    expect((ANCHOR.getTime() - oldest) / 86_400_000).toBeGreaterThan(150);
  });

  it('every user email is unique and on the demo domain', () => {
    const emails = w.authUsers.map((u) => u.email);
    expect(new Set(emails).size).toBe(emails.length);
    for (const e of emails) expect(e).toMatch(/@demo\.tend\.sg$/);
  });

  it('narratives and evidence never contain roster child names or Tone Guard words', () => {
    const roster = rows('class_roster').map((r) => String(r.child_name).toLowerCase());
    const text = JSON.stringify([...rows('narrative'), ...rows('evidence_unit')]).toLowerCase();
    for (const n of roster) expect(text.includes(n), n).toBe(false);
    for (const word of TONE_WORDS) expect(new RegExp(`\\b${word}\\b`).test(text), word).toBe(false);
  });

  it('every narrative sentence cites at least one evidence unit of the same observation', () => {
    const evByObs = new Map<string, Set<string>>();
    for (const e of rows('evidence_unit')) {
      const s = evByObs.get(e.observation_id as string) ?? new Set();
      s.add(e.id as string);
      evByObs.set(e.observation_id as string, s);
    }
    for (const n of rows('narrative')) {
      const c = (n.content as { __json: { glows: { evidence_ids: string[] }[]; grows: { evidence_ids: string[] }[]; next_step: { evidence_ids: string[] } } }).__json;
      const valid = evByObs.get(n.observation_id as string)!;
      for (const s of [...c.glows, ...c.grows, c.next_step]) {
        expect(s.evidence_ids.length).toBeGreaterThan(0);
        for (const id of s.evidence_ids) expect(valid.has(id)).toBe(true);
      }
      expect(c.glows.length).toBeLessThanOrEqual(3);
      expect(c.grows.length).toBeLessThanOrEqual(2);
    }
  });
});

describe('seed.sql loads and tells the demo story (queried as Sandra under RLS)', () => {
  let t: TestDb;
  let w: World;
  const asSandra = <T,>(sql: string, p: unknown[] = []) => t.q<T>(w.ids.sandra, sql, p);

  beforeAll(async () => {
    t = await createTestDb();
    w = buildWorld(ANCHOR);
    await t.db.exec(toSql(w));
    // make SQL now() comparisons line up with the anchor
  });

  it('loads every row', async () => {
    for (const [table, rows] of w.tables) {
      const [{ n }] = (await t.db.query<{ n: number }>(`select count(*)::int as n from public.${table}`)).rows;
      expect(n, table).toBe(rows.length);
    }
  });

  it('Sandra sees her 15 educators and no other centre’s observations', async () => {
    const [{ n }] = await asSandra<{ n: number }>(`select count(*)::int n from public.educator_profile p where p.centre_id = $1`, [w.ids.punggol]);
    expect(n).toBe(15);
    const centres = await asSandra<{ centre_id: string }>(`select distinct centre_id from public.observation`);
    expect(centres).toEqual([{ centre_id: w.ids.punggol }]);
  });

  it('GAP: at least 9 of 15 educators have accepted Grow tags in 3.4 Self-regulation', async () => {
    const [{ n }] = await asSandra<{ n: number }>(
      `select count(distinct o.educator_id)::int n from public.tag g join public.indicator i on i.id = g.indicator_id
       join public.observation o on o.id = g.observation_id
       where i.subdomain_code = '3.4' and g.valence = 'grow' and g.state = 'accepted' and o.centre_id = $1`, [w.ids.punggol]);
    expect(n).toBeGreaterThanOrEqual(9);
  });

  it('BLIND SPOT: no 2.1.3 Diversity evidence in the last 90 days (but some older)', async () => {
    const rows = await asSandra<{ recent: number; old: number }>(
      `select count(*) filter (where o.scheduled_at > $2::timestamptz - interval '90 days')::int recent,
              count(*) filter (where o.scheduled_at <= $2::timestamptz - interval '90 days')::int old
       from public.tag g join public.indicator i on i.id = g.indicator_id join public.observation o on o.id = g.observation_id
       where i.code = '2.1.3' and o.centre_id = $1`, [w.ids.punggol, ANCHOR.toISOString()]);
    expect(rows[0].recent).toBe(0);
    expect(rows[0].old).toBeGreaterThan(0);
  });

  it('STRENGTH: subdomain 1.1 tags are mostly Glows at Level 2–3', async () => {
    const [r] = await asSandra<{ glow_hi: number; total: number }>(
      `select count(*) filter (where g.valence = 'glow' and g.level >= 2)::int glow_hi, count(*)::int total
       from public.tag g join public.indicator i on i.id = g.indicator_id join public.observation o on o.id = g.observation_id
       where i.subdomain_code = '1.1' and g.state = 'accepted' and o.centre_id = $1`, [w.ids.punggol]);
    expect(r.total).toBeGreaterThan(50);
    expect(r.glow_hi / r.total).toBeGreaterThan(0.75);
  });

  it('AISHA: 3.3.4 last seen at Level 1, 6 weeks ago; story time is scheduled with no focus yet', async () => {
    const aisha = w.ids.people.aisha;
    const [last] = await t.q<{ level: number; days: number }>(aisha,
      `select g.level, round(extract(epoch from ($1::timestamptz - o.scheduled_at)) / 86400)::int days
       from public.tag g join public.indicator i on i.id = g.indicator_id join public.observation o on o.id = g.observation_id
       where i.code = '3.3.4' and g.state = 'accepted' order by o.scheduled_at desc limit 1`, [ANCHOR.toISOString()]);
    expect(last.level).toBe(1);
    expect(last.days).toBeGreaterThanOrEqual(41);
    expect(last.days).toBeLessThanOrEqual(43);
    const [up] = await t.q<{ status: string; focus: number }>(aisha, `select status, cardinality(focus_goal_ids) focus from public.observation where id = $1`, [w.ids.aishaUpcomingObs]);
    expect(up).toEqual({ status: 'scheduled', focus: 0 });
    const [goal] = await t.q<{ code: string }>(aisha, `select i.code from public.idp_goal g join public.idp d on d.id = g.idp_id join public.indicator i on i.id = g.indicator_id where d.educator_id = $1 and d.status = 'active' order by g.position limit 1`, [aisha]);
    expect(goal.code).toBe('3.3.4');
  });

  it('FARAH: opted in to Peer Match and seen at Level 3 on 3.3.4', async () => {
    const farah = w.ids.people.farah;
    const [r] = await asSandra<{ opt: boolean; l3: number }>(
      `select p.peer_match_opt_in opt,
              (select count(*)::int from public.tag g join public.indicator i on i.id = g.indicator_id join public.observation o on o.id = g.observation_id
               where o.educator_id = p.user_id and i.code = '3.3.4' and g.level = 3 and g.state = 'accepted') l3
       from public.educator_profile p where p.user_id = $1`, [farah]);
    expect(r.opt).toBe(true);
    expect(r.l3).toBeGreaterThan(0);
  });

  it('TODAY QUEUE has a draft to review (Ravi) and a debrief due (Nurul)', async () => {
    const drafts = await asSandra<{ id: string }>(`select id from public.observation where status = 'ai_draft'`);
    expect(drafts.map((d) => d.id)).toEqual([w.ids.ravidDraftObs]);
    const due = await asSandra<{ id: string }>(`select id from public.observation where status = 'acknowledged'`);
    expect(due.map((d) => d.id)).toContain(w.ids.nurulDebriefObs);
  });

  it('the APPROVAL GATE holds on seeded data: Ravi cannot see his unapproved draft', async () => {
    const n = await t.q(w.ids.people.ravi, `select 1 from public.narrative where observation_id = $1`, [w.ids.ravidDraftObs]);
    expect(n).toHaveLength(0);
  });

  it('KPI inputs exist: tagging acceptance ≈ 70–85%, edit ratio under 15% for most approvals', async () => {
    const [r] = await asSandra<{ accepted: number; total: number }>(
      `select count(*) filter (where e.action = 'accept')::int accepted, count(*)::int total from public.tag_event e`);
    const rate = r.accepted / r.total;
    expect(rate).toBeGreaterThan(0.65);
    expect(rate).toBeLessThan(0.9);
    const [e] = await asSandra<{ under: number; total: number }>(
      `select count(*) filter (where edit_ratio < 0.15)::int under, count(*)::int total from public.observation where edit_ratio is not null`);
    expect(e.under / e.total).toBeGreaterThan(0.7);
  });

  it('every observation tag references an indicator from the active framework version it was made with', async () => {
    const [{ n }] = (await t.db.query<{ n: number }>(
      `select count(*)::int n from public.tag g join public.indicator i on i.id = g.indicator_id where g.framework_version_id <> i.framework_version_id`)).rows;
    expect(n).toBe(0);
  });
});
