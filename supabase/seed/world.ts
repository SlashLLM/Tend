/**
 * Deterministic synthetic demo world (PRD Appendix B "Demo seed data").
 * No real people or children. Same output for the same anchor date.
 *
 * Story the data must tell (asserted by tests):
 *   - Punggol: Sandra Tan + 15 educators across IC–K2
 *   - ~120 past observations over 2 terms
 *   - centre-wide GAP in 3.4 Self-regulation (≥ 9 educators with Grow tags there)
 *   - BLIND SPOT on 2.1.3 Diversity (no evidence in the last 90 days)
 *   - STRENGTH in 1.1 (mostly Glows at Level 2–3)
 *   - Aisha: 3.3.4 last seen at Level 1, 6 weeks ago; upcoming story-time observation
 *   - Farah: seen at Level 3 on 3.3.4 and opted in to Peer Match
 */
import {
  COURSES, EYDF_PRACTICES, INTERNAL_ACTIVITIES, OCCUPATIONAL_TITLES, QTT, SUBDOMAIN_TO_TSC, TRUE_VALUES, TSC, flatIndicators,
} from './registry';
import { infantQuestions, preschoolQuestions } from '../../lib/lna/content';

// ───────────────────────── deterministic helpers ─────────────────────────

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Json = { __json: unknown };
export const json = (v: unknown): Json => ({ __json: v });
export type Cell = string | number | boolean | null | Date | Json | string[];
export type Row = Record<string, Cell>;

const DAY = 86_400_000;

// ───────────────────────── people ─────────────────────────

type Person = {
  key: string; name: string; title: 'EYE' | 'PT' | 'LT'; cls: string; years: number;
  locale?: 'en' | 'zh'; textScale?: number; optIn?: boolean; gap34?: boolean; base: number;
};

const PUNGGOL: Person[] = [
  { key: 'aisha', name: 'Aisha binte Rahman', title: 'PT', cls: 'K1', years: 3, base: 1.6, gap34: true },
  { key: 'meiling', name: 'Lee Mei Ling', title: 'EYE', cls: 'N1', years: 22, locale: 'zh', textScale: 130, base: 2.2, gap34: true },
  { key: 'farah', name: 'Farah Ismail', title: 'LT', cls: 'K2', years: 9, optIn: true, base: 2.6 },
  { key: 'ravi', name: 'Ravi Kumar', title: 'PT', cls: 'N2', years: 1, base: 1.3, gap34: true },
  { key: 'huimin', name: 'Tan Hui Min', title: 'PT', cls: 'K2', years: 6, base: 2.1, gap34: true, optIn: true },
  { key: 'nurul', name: 'Nurul Huda', title: 'PT', cls: 'K1', years: 4, base: 1.8, gap34: true },
  { key: 'priya', name: 'Priya Nair', title: 'PT', cls: 'N2', years: 5, base: 2.0, gap34: true },
  { key: 'jiahui', name: 'Chen Jia Hui', title: 'EYE', cls: 'N1', years: 2, base: 1.5, gap34: true },
  { key: 'siti', name: 'Siti Aminah', title: 'EYE', cls: 'IC', years: 7, base: 2.0 },
  { key: 'grace', name: 'Grace Ong', title: 'EYE', cls: 'PG', years: 3, base: 1.7, gap34: true },
  { key: 'kavitha', name: 'Kavitha Raj', title: 'LT', cls: 'N2', years: 11, optIn: true, base: 2.5 },
  { key: 'joanne', name: 'Joanne Teo', title: 'PT', cls: 'K1', years: 2, base: 1.6, gap34: true },
  { key: 'zhangwei', name: 'Zhang Wei', title: 'PT', cls: 'K2', years: 8, base: 2.3 },
  { key: 'michelle', name: 'Michelle Lim', title: 'EYE', cls: 'IC', years: 4, base: 1.9 },
  { key: 'hafizah', name: 'Hafizah Yusof', title: 'PT', cls: 'N1', years: 5, base: 2.0, gap34: true },
];

const OTHER_CENTRES: { key: string; name: string; leader: string; educators: string[] }[] = [
  { key: 'tampines', name: 'Tampines', leader: 'Rachel Goh', educators: ['Amanda Chua', 'Divya Menon', 'Lim Xin Yi', 'Nadia Salleh', 'Ong Pei Shan', 'Wong Li Ting'] },
  { key: 'jurong', name: 'Jurong West', leader: 'Melissa Ho', educators: ['Aaron Tay', 'Fatimah Zahra', 'Koh Shu Fen', 'Lakshmi Iyer', 'Sharon Yeo', 'Tan Wei Ming'] },
];

const CLASSES = [
  { level: 'IC', name: 'Little Seeds (Infant Care)' },
  { level: 'PG', name: 'Sprouts (Playgroup)' },
  { level: 'N1', name: 'Rainbow (N1)' },
  { level: 'N2', name: 'Stars (N2)' },
  { level: 'K1', name: 'Sunflower (K1)' },
  { level: 'K2', name: 'Explorers (K2)' },
];

const ACTIVITIES = ['story time', 'circle time', 'outdoor play', 'mealtime', 'block play', 'the art corner', 'the maths centre', 'music and movement', 'transition to nap time'];

// Synthetic roster names (for redaction tests only).
const ROSTER = ['Wei Ling', 'Arjun', 'Hana', 'Ethan', 'Mei Xin', 'Irfan', 'Sophia', 'Darren', 'Aaliyah', 'Jun Hao'];

// ───────────────────────── build ─────────────────────────

export type World = {
  anchor: Date;
  authUsers: { id: string; email: string }[];
  tables: [table: string, rows: Row[]][];
  ids: {
    org: string; punggol: string; sandra: string; hq: string; admin: string;
    people: Record<string, string>; indicators: Record<string, string>; qttVersion: string;
    aishaUpcomingObs: string; ravidDraftObs: string; nurulDebriefObs: string;
  };
};

export function buildWorld(anchor: Date = new Date()): World {
  const rnd = mulberry32(30); // ECDA Call 30
  const uuid = () => {
    const h = Array.from({ length: 32 }, () => Math.floor(rnd() * 16).toString(16));
    h[12] = '4';
    h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
    const s = h.join('');
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  };
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const between = (a: number, b: number) => a + rnd() * (b - a);
  const daysAgo = (d: number, hour = 10) => {
    const t = new Date(anchor.getTime() - d * DAY);
    t.setUTCHours(hour - 8, 0, 0, 0); // SGT clock hour
    return t;
  };
  const clampLevel = (x: number) => Math.max(1, Math.min(3, Math.round(x)));

  const T: Record<string, Row[]> = {};
  const add = (table: string, row: Row) => ((T[table] ??= []).push(row), row);

  // org / centres
  const org = uuid();
  add('organisation', { id: org, name: 'Agape Little Uni (demo)' });
  const punggol = uuid();
  add('centre', { id: punggol, org_id: org, name: 'Punggol' });
  const otherCentreIds: Record<string, string> = {};
  for (const c of OTHER_CENTRES) {
    otherCentreIds[c.key] = uuid();
    add('centre', { id: otherCentreIds[c.key], org_id: org, name: c.name });
  }

  // registry
  const qttFw = uuid();
  const qttV = uuid();
  add('framework', { id: qttFw, org_id: null, code: 'QTT', name: QTT.framework.name });
  add('framework_version', { id: qttV, org_id: null, framework_id: qttFw, version: QTT.framework.version, status: 'active', activated_at: daysAgo(400) });

  const sfwFw = uuid();
  const sfwV = uuid();
  add('framework', { id: sfwFw, org_id: null, code: 'SFW_EC', name: 'Skills Framework for Early Childhood (draft seed)' });
  add('framework_version', { id: sfwV, org_id: null, framework_id: sfwFw, version: 'seed-draft', status: 'active', activated_at: daysAgo(400) });

  const eydfFw = uuid();
  const eydfV = uuid();
  add('framework', { id: eydfFw, org_id: null, code: 'EYDF', name: 'EYDF-aligned practice set (draft)' });
  add('framework_version', { id: eydfV, org_id: null, framework_id: eydfFw, version: 'seed-draft', status: 'active', activated_at: daysAgo(400) });

  const trueFw = uuid();
  const trueV = uuid();
  add('framework', { id: trueFw, org_id: org, code: 'TRUE', name: 'Agape TRUE values' });
  add('framework_version', { id: trueV, org_id: org, framework_id: trueFw, version: '1', status: 'active', activated_at: daysAgo(400) });

  const indicatorIds: Record<string, string> = {};
  const flat = flatIndicators();
  for (const i of flat) {
    indicatorIds[i.code] = uuid();
    add('indicator', {
      id: indicatorIds[i.code], org_id: null, framework_version_id: qttV, code: i.code, name: i.name,
      domain_code: i.domain_code, domain_name: i.domain_name, subdomain_code: i.subdomain_code, subdomain_name: i.subdomain_name,
      level_descriptors: json(i.levels), look_fors: json(i.look_fors), age_band: '2-6',
    });
  }
  for (const p of EYDF_PRACTICES) {
    indicatorIds[p.code] = uuid();
    add('indicator', {
      id: indicatorIds[p.code], org_id: null, framework_version_id: eydfV, code: p.code, name: p.name,
      domain_code: 'IT', domain_name: 'Infant and Toddler Practice', subdomain_code: 'IT', subdomain_name: p.subdomain,
      level_descriptors: json({}), look_fors: json([]), age_band: '0-2',
    });
  }
  for (const v of TRUE_VALUES) {
    add('indicator', {
      id: uuid(), org_id: org, framework_version_id: trueV, code: v.code, name: v.name,
      domain_code: 'TRUE', domain_name: 'Agape Values', subdomain_code: 'TRUE', subdomain_name: 'Values',
      level_descriptors: json({}), look_fors: json([]), age_band: '0-6',
    });
  }

  const titleIds: Record<string, string> = {};
  for (const t of OCCUPATIONAL_TITLES) {
    titleIds[t.code] = uuid();
    add('occupational_title', { id: titleIds[t.code], org_id: null, code: t.code, name: t.name, age_group: t.age_group });
  }
  const tscIds: Record<string, string> = {};
  for (const t of TSC) {
    tscIds[t.code] = uuid();
    add('tsc', { id: tscIds[t.code], org_id: null, framework_version_id: sfwV, code: t.code, title: t.title, category: t.category, proficiency_levels: json(t.proficiency_levels) });
  }
  for (const i of flat) {
    add('indicator_tsc_map', { id: uuid(), org_id: null, indicator_id: indicatorIds[i.code], tsc_id: tscIds[SUBDOMAIN_TO_TSC[i.subdomain_code]], proficiency_level: 2 });
  }
  for (const p of EYDF_PRACTICES) {
    add('indicator_tsc_map', { id: uuid(), org_id: null, indicator_id: indicatorIds[p.code], tsc_id: tscIds['EC-TSC-INF'], proficiency_level: 2 });
  }

  // pd catalogue
  for (const a of [...COURSES, ...INTERNAL_ACTIVITIES]) {
    add('pd_activity', {
      id: uuid(), org_id: a.tier === 'course' ? null : org, centre_id: null, tier: a.tier, provider: a.provider, title: a.title,
      mode: a.mode, hours: a.hours, fee_sgd: a.fee_sgd, funding: a.funding, funded: a.funded,
      next_run: a.next_run_days === null ? null : new Date(anchor.getTime() + a.next_run_days * DAY).toISOString().slice(0, 10),
      url: a.tier === 'course' ? 'https://example.org/course-placeholder' : null,
      indicator_codes: a.indicator_codes, tsc_codes: a.tsc_codes, subdomain_codes: a.subdomain_codes,
      level_min: a.level_min, level_max: a.level_max, source_updated_at: daysAgo(30).toISOString().slice(0, 10),
    });
  }

  // users
  const authUsers: World['authUsers'] = [];
  const person = (name: string, extra: Partial<Row> = {}) => {
    const id = uuid();
    const email = `${name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@demo.tend.sg`;
    authUsers.push({ id, email });
    add('app_user', { id, org_id: org, full_name: name, email, locale: 'en', text_scale: 100, onboarded_at: daysAgo(200), ...extra });
    add('consent', { id: uuid(), org_id: org, user_id: id, kind: 'ai_processing_notice', version: '2026-10', granted_at: daysAgo(200) });
    return id;
  };

  const sandra = person('Sandra Tan');
  add('membership', { id: uuid(), org_id: org, user_id: sandra, centre_id: punggol, role: 'leader' });
  const hq = person('Daniel Koh');
  add('membership', { id: uuid(), org_id: org, user_id: hq, centre_id: null, role: 'hq' });
  const admin = person('Agape IT Admin');
  add('membership', { id: uuid(), org_id: org, user_id: admin, centre_id: null, role: 'admin' });

  const classIds: Record<string, string> = {};
  for (const c of CLASSES) {
    classIds[c.level] = uuid();
    add('class', {
      id: classIds[c.level], org_id: org, centre_id: punggol, name: c.name, level: c.level,
      parental_media_consent: c.level !== 'IC', ambient_audio_consent: false,
    });
    // K1 (Aisha's class) always includes the two names used in the scripted demo dictation.
    const names = c.level === 'K1' ? ['Wei Ling', 'Arjun', pick(ROSTER), pick(ROSTER)] : [pick(ROSTER), pick(ROSTER), pick(ROSTER), pick(ROSTER)];
    for (const n of [...new Set(names)]) {
      add('class_roster', { id: uuid(), org_id: org, centre_id: punggol, class_id: classIds[c.level], child_name: n, aliases: [] });
    }
  }

  const people: Record<string, string> = {};
  for (const p of PUNGGOL) {
    const id = person(p.name, { locale: p.locale ?? 'en', text_scale: p.textScale ?? 100 });
    people[p.key] = id;
    add('membership', { id: uuid(), org_id: org, user_id: id, centre_id: punggol, role: 'educator' });
    const infant = p.cls === 'IC';
    add('educator_profile', {
      user_id: id, org_id: org, centre_id: punggol, occupational_title_id: titleIds[p.title],
      age_group: infant ? 'infant_toddler' : 'preschool', years_experience: p.years, peer_match_opt_in: !!p.optIn,
    });
    add('class_educator', { class_id: classIds[p.cls], user_id: id, org_id: org });
    if (p.optIn) add('consent', { id: uuid(), org_id: org, user_id: id, kind: 'peer_match', version: '2026-10', granted_at: daysAgo(150) });
  }
  people.sandra = sandra;

  const otherEducators: { id: string; centre: string; base: number }[] = [];
  for (const c of OTHER_CENTRES) {
    const lid = person(c.leader);
    people[`${c.key}_leader`] = lid;
    add('membership', { id: uuid(), org_id: org, user_id: lid, centre_id: otherCentreIds[c.key], role: 'leader' });
    for (const n of c.educators) {
      const eid = person(n);
      add('membership', { id: uuid(), org_id: org, user_id: eid, centre_id: otherCentreIds[c.key], role: 'educator' });
      add('educator_profile', {
        user_id: eid, org_id: org, centre_id: otherCentreIds[c.key], occupational_title_id: titleIds.PT,
        age_group: 'preschool', years_experience: Math.floor(between(1, 12)), peer_match_opt_in: rnd() < 0.3,
      });
      otherEducators.push({ id: eid, centre: otherCentreIds[c.key], base: between(1.4, 2.6) });
    }
  }

  // IDPs (active) — Aisha's first goal is 3.3.4
  const idpGoalsByPerson: Record<string, { id: string; code: string }[]> = {};
  const makeIdp = (educator: string, centre: string, codes: string[], cur: number[]) => {
    const idp = uuid();
    add('idp', {
      id: idp, org_id: org, centre_id: centre, educator_id: educator, lineage_id: uuid(), version: 1, status: 'active',
      educator_confirmed_at: daysAgo(150), leader_confirmed_at: daysAgo(149), created_by: educator, created_at: daysAgo(151),
    });
    idpGoalsByPerson[educator] = codes.map((code, k) => {
      const id = uuid();
      const sub = code.split('.').slice(0, 2).join('.');
      add('idp_goal', {
        id, org_id: org, idp_id: idp, indicator_id: indicatorIds[code], framework_version_id: code.startsWith('IT') ? eydfV : qttV,
        current_level: cur[k], target_level: Math.min(3, cur[k] + 1), tsc_id: tscIds[SUBDOMAIN_TO_TSC[sub] ?? 'EC-TSC-INF'],
        review_date: new Date(anchor.getTime() + (20 + k * 7) * DAY).toISOString().slice(0, 10), position: k,
      });
      add('idp_action', { id: uuid(), org_id: org, idp_goal_id: id, description: `Practise "${lookFor(code, 0)}" weekly`, source: 'lna', status: 'open' });
      return { id, code };
    });
  };
  const lookFor = (code: string, k: number) => flat.find((i) => i.code === code)?.look_fors[k] ?? 'the practice';

  const preschoolCodes = flat.map((i) => i.code);
  const pool34 = preschoolCodes.filter((c) => c.startsWith('3.4.'));
  for (const p of PUNGGOL) {
    const id = people[p.key];
    if (p.key === 'meiling') continue; // demo: Mdm Lee completes her needs analysis (in 中文) live
    if (p.cls === 'IC') makeIdp(id, punggol, ['IT.1', 'IT.4'], [2, 1]);
    else if (p.key === 'aisha') makeIdp(id, punggol, ['3.3.4', '3.4.2', '2.2.4'], [1, 1, 2]);
    else if (p.key === 'farah') makeIdp(id, punggol, ['3.2.4', '2.1.3'], [2, 2]);
    else {
      const goals = [p.gap34 ? pick(pool34) : pick(preschoolCodes.filter((c) => c.startsWith('3.3.'))), pick(preschoolCodes.filter((c) => !c.startsWith('2.1.3')))];
      makeIdp(id, punggol, [...new Set(goals)], [clampLevel(p.base - 0.4), clampLevel(p.base)]);
    }
  }
  for (const e of otherEducators) makeIdp(e.id, e.centre, [pick(preschoolCodes), pick(pool34)].filter((v, i, a) => a.indexOf(v) === i), [1, 1]);

  // ───────────────────────── observation history ─────────────────────────

  const glowText = (code: string) => `You ${lowerFirst(lookFor(code, Math.floor(rnd() * 3)))}, and the children responded well.`;
  const growText = (code: string) => `An opportunity to try: ${lowerFirst(lookFor(code, Math.floor(rnd() * 3)))}. This helps children go further.`;

  type TagSpec = { code: string; level: number; valence: 'glow' | 'grow'; confidence: number; pinned?: boolean };

  const makeObservation = (o: {
    educator: string; centre: string; observer: string; daysAgo: number; status: string; tags: TagSpec[][]; activity?: string;
    withDraftOnly?: boolean; classLevel?: string;
  }) => {
    const id = uuid();
    const activity = o.activity ?? pick(ACTIVITIES);
    const scheduled = daysAgo(o.daysAgo, 9 + Math.floor(rnd() * 6));
    const captureEnd = new Date(scheduled.getTime() + 20 * 60_000);
    const shared = !['ai_draft', 'in_review', 'scheduled'].includes(o.status);
    const editRatio = rnd() < 0.8 ? between(0.01, 0.14) : between(0.15, 0.35);
    const reviewMs = Math.round(between(2, 6) * 60_000);
    add('observation', {
      id, org_id: org, centre_id: o.centre, educator_id: o.educator, observer_id: o.observer,
      class_id: o.classLevel ? classIds[o.classLevel] ?? null : null, framework_version_id: qttV, title: activity[0].toUpperCase() + activity.slice(1),
      scheduled_at: scheduled, duration_min: 20, status: o.status, pipeline_step: 'done',
      focus_goal_ids: (idpGoalsByPerson[o.educator] ?? []).slice(0, 1).map((g) => g.id),
      capture_started_at: scheduled, capture_ended_at: captureEnd,
      review_active_ms: shared ? reviewMs : 0,
      approved_by: shared ? o.observer : null,
      approved_at: shared ? new Date(captureEnd.getTime() + reviewMs + 30 * 60_000) : null,
      edit_ratio: shared ? Number(editRatio.toFixed(3)) : null,
      transcript_wer: shared ? Number(between(0.02, 0.07).toFixed(3)) : null,
      shared_at: shared ? new Date(captureEnd.getTime() + reviewMs + 30 * 60_000) : null,
      created_at: daysAgo(o.daysAgo + 2),
    });

    const glows: { text: string; evidence_ids: string[] }[] = [];
    const grows: { text: string; evidence_ids: string[] }[] = [];
    o.tags.forEach((unitTags, idx) => {
      const ev = uuid();
      const main = unitTags[0];
      add('evidence_unit', {
        id: ev, org_id: org, observation_id: id, idx, start_ms: idx * 300_000 + 30_000, end_ms: idx * 300_000 + 75_000,
        text: `During ${activity}, ${main.valence === 'glow' ? 'the educator' : 'there was a moment where the educator could'} ${lowerFirst(lookFor(main.code, idx % 3))}. Child ${'ABC'[idx]} ${main.valence === 'glow' ? 'joined in eagerly' : 'waited for a prompt'}.`,
        capture_item_ids: [],
      });
      for (const t of unitTags) {
        const tag = uuid();
        const indicatorId = indicatorIds[t.code];
        const reviewRoll = rnd();
        let state = shared ? 'accepted' : 'suggested';
        let level = t.level;
        let changed = false;
        add('tag', {
          id: tag, org_id: org, observation_id: id, evidence_unit_id: ev, indicator_id: indicatorId,
          framework_version_id: t.code.startsWith('IT') ? eydfV : qttV, level, valence: t.valence, confidence: Number(t.confidence.toFixed(2)),
          reason: `Evidence matches: ${lookFor(t.code, 0)}`, source: 'ai', state, changed_by_leader: changed, created_at: captureEnd,
        });
        if (shared) {
          const row = T.tag[T.tag.length - 1];
          if (t.pinned || reviewRoll < 0.76) {
            add('tag_event', { id: uuid(), org_id: org, tag_id: tag, actor_id: o.observer, action: 'accept', from_level: level, to_level: level, created_at: captureEnd });
          } else if (reviewRoll < 0.88) {
            const to = level === 3 ? 2 : level + 1;
            row.level = to; row.changed_by_leader = true; level = to; changed = true;
            add('tag_event', { id: uuid(), org_id: org, tag_id: tag, actor_id: o.observer, action: 'change_level', from_level: t.level, to_level: to, created_at: captureEnd });
          } else {
            row.state = 'rejected'; row.changed_by_leader = true; state = 'rejected';
            add('tag_event', { id: uuid(), org_id: org, tag_id: tag, actor_id: o.observer, action: 'reject', from_level: level, to_level: level, created_at: captureEnd });
          }
        }
        if (state !== 'rejected' || !shared) {
          if (t.valence === 'glow' && glows.length < 3) glows.push({ text: glowText(t.code), evidence_ids: [ev] });
          if (t.valence === 'grow' && grows.length < 2) grows.push({ text: growText(t.code), evidence_ids: [ev] });
        }
      }
    });
    const firstEv = T.evidence_unit.find((e) => e.observation_id === id)!.id as string;
    const growCode = o.tags.flat().find((t) => t.valence === 'grow')?.code ?? o.tags[0][0].code;
    const content = {
      glows: glows.length ? glows : [{ text: glowText(o.tags[0][0].code), evidence_ids: [firstEv] }],
      grows,
      next_step: {
        text: `Next step: ${lowerFirst(lookFor(growCode, 2))} once this week.`,
        evidence_ids: [firstEv],
        goal_id: (idpGoalsByPerson[o.educator] ?? []).find((g) => g.code === growCode)?.id ?? null,
      },
    };
    add('narrative', { id: uuid(), org_id: org, observation_id: id, version: 1, author: 'ai', content: json(content), is_final: false, created_at: captureEnd });
    if (shared) {
      add('narrative', { id: uuid(), org_id: org, observation_id: id, version: 2, author: 'leader', content: json(content), is_final: true, created_by: o.observer, created_at: captureEnd });
    }
    // coaching card for the first grow
    const growTag = o.tags.flat().find((t) => t.valence === 'grow');
    let cardId: string | null = null;
    if (growTag) {
      cardId = uuid();
      add('coaching_card', {
        id: cardId, org_id: org, observation_id: id, educator_id: o.educator, indicator_id: indicatorIds[growTag.code],
        title: `Try: ${lookFor(growTag.code, 0)}`,
        body: json({
          why: 'Small, repeated moments like this help children think and feel secure.',
          try_tomorrow: lookFor(growTag.code, 0),
          say_it: 'I wonder… what do you think?',
          adapt_by_age: 'Younger children: keep it to one step. Older children: invite them to explain.',
          reflect_after: 'What did the children do differently?',
        }),
        status: shared ? 'approved' : 'draft',
      });
    }
    if (shared) {
      add('educator_response', { id: uuid(), org_id: org, observation_id: id, educator_id: o.educator, kind: 'reflection', body: 'I felt it went fairly well; some children were quieter than usual.', created_at: new Date(captureEnd.getTime() + DAY / 2) });
      if (grows.length) add('educator_response', { id: uuid(), org_id: org, observation_id: id, educator_id: o.educator, kind: rnd() < 0.85 ? 'agree' : 'context', target_ref: 'grow:0', body: 'Noted, thank you.', created_at: new Date(captureEnd.getTime() + DAY / 2) });
      add('feedback_event', { id: uuid(), org_id: org, centre_id: o.centre, user_id: o.educator, kind: 'feedback_thumbs', ref_id: id, value: rnd() < 0.88 ? 'up' : 'down', created_at: new Date(captureEnd.getTime() + DAY / 2) });
      if (o.status === 'discussed') {
        add('debrief', { id: uuid(), org_id: org, observation_id: id, agenda: json({ celebrate: glows[0]?.text ?? '', questions: ['What did you notice about the children?', 'What would you try next time?'], decision: content.next_step.text }), notes: 'Agreed next step.', started_at: new Date(captureEnd.getTime() + 3 * DAY), completed_at: new Date(captureEnd.getTime() + 3 * DAY + 15 * 60_000) });
      }
      if (cardId && rnd() < 0.72) {
        add('strategy_attempt', { id: uuid(), org_id: org, centre_id: o.centre, educator_id: o.educator, coaching_card_id: cardId, indicator_id: growTag ? indicatorIds[growTag.code] : null, note: 'Tried it during group time.', tried_on: new Date(captureEnd.getTime() + 2 * DAY).toISOString().slice(0, 10) });
      }
    }
    return id;
  };

  const strengthTag = (base: number): TagSpec => ({ code: pick(['1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.5']), level: clampLevel(base + between(0.2, 1)), valence: 'glow', confidence: between(0.7, 0.95) });
  const gapTag = (): TagSpec => ({ code: pick(pool34), level: 1, valence: 'grow', confidence: between(0.6, 0.9) });
  const otherCodes = preschoolCodes.filter((c) => !c.startsWith('1.1.') && !c.startsWith('3.4.') && c !== '2.1.3');
  const otherTag = (base: number): TagSpec => {
    const lvl = clampLevel(base + between(-0.6, 0.6));
    return { code: pick(otherCodes), level: lvl, valence: lvl >= 2 && rnd() < 0.6 ? 'glow' : 'grow', confidence: between(0.45, 0.95) };
  };

  // Punggol: 13 preschool educators × ~9 observations over 26 weeks (+ infant-room observations)
  for (const p of PUNGGOL) {
    const educator = people[p.key];
    if (p.cls === 'IC') {
      for (const d of [150, 90, 40]) {
        makeObservation({ educator, centre: punggol, observer: sandra, daysAgo: d, status: 'discussed', classLevel: 'IC',
          tags: [[{ code: pick(['IT.1', 'IT.2', 'IT.4']), level: clampLevel(p.base), valence: 'glow', confidence: 0.8 }], [{ code: pick(['IT.3', 'IT.5']), level: 1, valence: 'grow', confidence: 0.7 }]] });
      }
      continue;
    }
    const days = [175, 160, 140, 120, 105, 90, 70, 55, 42].map((d) => d + Math.floor(between(-4, 4)));
    days.forEach((d, k) => {
      const units: TagSpec[][] = [[strengthTag(p.base)], [otherTag(p.base)]];
      if (p.gap34 && k % 2 === 0) units.push([gapTag()]);
      else units.push([otherTag(p.base)]);
      // Diversity evidence only long ago → blind spot in last 90 days
      if (d > 120 && k === 0) units[1] = [{ code: '2.1.3', level: clampLevel(p.base), valence: 'glow', confidence: 0.7 }];
      if (p.key === 'aisha') {
        units[1] = [{ code: '3.3.4', level: 1, valence: 'grow', confidence: 0.82, pinned: true }];
      }
      if (p.key === 'farah' && k >= 4) units[1] = [{ code: '3.3.4', level: 3, valence: 'glow', confidence: 0.9, pinned: true }];
      // Aisha's most recent observation is exactly 6 weeks ago (3.3.4 at Level 1).
      makeObservation({ educator, centre: punggol, observer: sandra, daysAgo: p.key === 'aisha' && k === days.length - 1 ? 42 : d,
        status: k === days.length - 1 && p.key === 'nurul' ? 'acknowledged' : 'discussed', tags: units, classLevel: p.cls });
    });
  }

  // other centres: a lighter history so HQ view has data (all groups ≥ 5 educators)
  for (const e of otherEducators) {
    for (const d of [150, 100, 60, 30]) {
      makeObservation({ educator: e.id, centre: e.centre, observer: T.membership.find((m) => m.centre_id === e.centre && m.role === 'leader')!.user_id as string,
        daysAgo: d + Math.floor(between(-5, 5)), status: 'discussed', tags: [[strengthTag(e.base)], [otherTag(e.base)], [rnd() < 0.5 ? gapTag() : otherTag(e.base)]] });
    }
  }

  // ── live demo state ──
  const nurulDebriefObs = T.observation.filter((o) => o.educator_id === people.nurul).at(-1)!.id as string;

  // Ravi: a draft waiting for Sandra's review (Today queue)
  const ravidDraftObs = makeObservation({ educator: people.ravi, centre: punggol, observer: sandra, daysAgo: 1, status: 'ai_draft', classLevel: 'N2',
    tags: [[strengthTag(1.3)], [gapTag()], [{ code: '3.3.4', level: 1, valence: 'grow', confidence: 0.52 }]] });

  // Aisha: K1 story time scheduled 2 days from now; she has not yet chosen a focus.
  const aishaUpcomingObs = uuid();
  add('observation', {
    id: aishaUpcomingObs, org_id: org, centre_id: punggol, educator_id: people.aisha, observer_id: sandra, class_id: classIds.K1,
    framework_version_id: qttV, title: 'K1 story time', scheduled_at: new Date(anchor.getTime() + 2 * DAY), duration_min: 20,
    status: 'scheduled', focus_goal_ids: [], created_at: anchor,
  });
  add('notification', { id: uuid(), org_id: org, user_id: people.aisha, kind: 'observation_scheduled', payload: json({ observation_id: aishaUpcomingObs }), created_at: anchor });

  // needs-analysis templates + completed analyses (Mdm Lee has none yet — she does it in the demo)
  const tplPre = uuid();
  const tplInf = uuid();
  add('lna_template', { id: tplPre, org_id: null, occupational_title_id: null, age_group: 'preschool', framework_version_id: qttV, questions: json(preschoolQuestions()) });
  add('lna_template', { id: tplInf, org_id: null, occupational_title_id: null, age_group: 'infant_toddler', framework_version_id: eydfV, questions: json(infantQuestions()) });
  const lnaFor = (educator: string, centre: string, infant: boolean) => {
    const goals = idpGoalsByPerson[educator];
    if (!goals) return;
    const att = uuid();
    add('lna_attempt', { id: att, org_id: org, centre_id: centre, educator_id: educator, template_id: infant ? tplInf : tplPre, status: 'completed', started_at: daysAgo(160), completed_at: daysAgo(160) });
    const roll = rnd();
    add('lna_result', {
      attempt_id: att, org_id: org, centre_id: centre, educator_id: educator,
      strengths: json([{ subdomain: infant ? 'IT.2' : '1.1', level: 2, skill: infant ? 'EC-TSC-INF' : 'EC-TSC-REL' }]),
      growth_areas: json(goals.map((g) => ({ subdomain: g.code.split('.').slice(0, 2).join('.'), level: 1, skill: 'EC-TSC-LAN' }))),
      suggested_goals: json(goals.map((g) => ({ indicator: g.code, current_level: 1, target_level: 2, reason: 'Seeded' }))),
      summary: null, agreement: roll < 0.88 ? 'yes' : roll < 0.96 ? 'partly' : 'no', created_at: daysAgo(160),
    });
  };
  for (const p of PUNGGOL) lnaFor(people[p.key], punggol, p.cls === 'IC');
  for (const e of otherEducators) lnaFor(e.id, e.centre, false);

  // adoption signals
  for (const id of Object.values(people)) {
    add('feedback_event', { id: uuid(), org_id: org, centre_id: punggol, user_id: id, kind: 'tour_complete', value: 'educator', created_at: daysAgo(199) });
  }

  // insertion order respects foreign keys
  const ORDER = [
    'organisation', 'centre', 'app_user', 'membership', 'consent', 'framework', 'framework_version', 'indicator', 'occupational_title',
    'tsc', 'indicator_tsc_map', 'pd_activity', 'educator_profile', 'class', 'class_educator', 'class_roster', 'lna_template', 'lna_attempt', 'lna_result', 'idp', 'idp_goal', 'idp_action',
    'observation', 'evidence_unit', 'tag', 'tag_event', 'narrative', 'coaching_card', 'educator_response', 'debrief', 'strategy_attempt',
    'feedback_event', 'notification',
  ];
  const missing = Object.keys(T).filter((k) => !ORDER.includes(k));
  if (missing.length) throw new Error(`seed tables missing from ORDER: ${missing.join(', ')}`);

  return {
    anchor,
    authUsers,
    tables: ORDER.filter((k) => T[k]).map((k) => [k, T[k]]),
    ids: { org, punggol, sandra, hq, admin, people, indicators: indicatorIds, qttVersion: qttV, aishaUpcomingObs, ravidDraftObs, nurulDebriefObs },
  };
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// ───────────────────────── SQL serialisation ─────────────────────────

function sqlValue(v: Cell): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (Array.isArray(v)) {
    const inner = v.map((x) => `"${String(x).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',');
    return `'{${inner.replace(/'/g, "''")}}'`;
  }
  if (typeof v === 'object' && '__json' in v) return `'${JSON.stringify(v.__json).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

export function toSql(world: World, { includeAuthUsers = true } = {}): string {
  const out: string[] = [
    '-- GENERATED by supabase/seed/build.ts — do not edit by hand. All data is synthetic.',
    `-- anchor date: ${world.anchor.toISOString()}`,
    'begin;',
  ];
  if (includeAuthUsers) {
    out.push(
      `insert into auth.users (id, email) values\n${world.authUsers.map((u) => `  (${sqlValue(u.id)}, ${sqlValue(u.email)})`).join(',\n')};`,
    );
  }
  for (const [table, rows] of world.tables) {
    // group rows by column signature so every INSERT has a consistent column list
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const key = Object.keys(r).join(',');
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
    }
    for (const [cols, rs] of groups) {
      for (let i = 0; i < rs.length; i += 500) {
        const chunk = rs.slice(i, i + 500);
        out.push(
          `insert into public.${table} (${cols}) values\n${chunk
            .map((r) => `  (${Object.values(r).map(sqlValue).join(', ')})`)
            .join(',\n')};`,
        );
      }
    }
  }
  out.push('commit;');
  return out.join('\n') + '\n';
}
