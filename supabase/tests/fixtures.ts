import type { TestDb } from './db';

/** Deterministic ids so test failures are readable. */
export const ID = {
  org: '00000000-0000-0000-0000-00000000a000',
  otherOrg: '00000000-0000-0000-0000-00000000b000',
  centreA: '00000000-0000-0000-0000-0000000ca000',
  centreB: '00000000-0000-0000-0000-0000000cb000',
  centreX: '00000000-0000-0000-0000-0000000cc000', // other org
  leaderA: '00000000-0000-0000-0000-000000001a01',
  eduA1: '00000000-0000-0000-0000-000000001a02', // "Aisha"
  eduA2: '00000000-0000-0000-0000-000000001a03', // colleague
  leaderB: '00000000-0000-0000-0000-000000001b01',
  eduB1: '00000000-0000-0000-0000-000000001b02',
  hq: '00000000-0000-0000-0000-000000001c01',
  admin: '00000000-0000-0000-0000-000000001c02',
  outsider: '00000000-0000-0000-0000-000000001d01', // leader in other org
  outsiderEdu: '00000000-0000-0000-0000-000000001d02',
  classA: '00000000-0000-0000-0000-0000000c1a00',
  qtt: '00000000-0000-0000-0000-0000000f0001',
  qttV1: '00000000-0000-0000-0000-0000000f0101',
  ind334: '00000000-0000-0000-0000-0000000e0334',
  ind111: '00000000-0000-0000-0000-0000000e0111',
  ind342: '00000000-0000-0000-0000-0000000e0342',
} as const;

/** Builds a small two-org world as the superuser (bypasses RLS, like the service role). */
export async function seedWorld({ db }: TestDb) {
  const users: [string, string, string][] = [
    [ID.leaderA, ID.org, 'Sandra Tan'],
    [ID.eduA1, ID.org, 'Aisha binte Rahman'],
    [ID.eduA2, ID.org, 'Farah Lim'],
    [ID.leaderB, ID.org, 'Leader B'],
    [ID.eduB1, ID.org, 'Educator B1'],
    [ID.hq, ID.org, 'Daniel Koh'],
    [ID.admin, ID.org, 'Admin'],
    [ID.outsider, ID.otherOrg, 'Other Leader'],
    [ID.outsiderEdu, ID.otherOrg, 'Other Educator'],
  ];
  await db.exec(`
    insert into public.organisation (id, name) values ('${ID.org}', 'Agape'), ('${ID.otherOrg}', 'Other Operator');
    insert into public.centre (id, org_id, name) values
      ('${ID.centreA}', '${ID.org}', 'Punggol'), ('${ID.centreB}', '${ID.org}', 'Tampines'),
      ('${ID.centreX}', '${ID.otherOrg}', 'Elsewhere');
  `);
  for (const [id, org, name] of users) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id}@t.test`]);
    await db.query(`insert into public.app_user (id, org_id, full_name, email) values ($1, $2, $3, $4)`, [
      id, org, name, `${id}@t.test`,
    ]);
  }
  await db.exec(`
    insert into public.membership (org_id, user_id, centre_id, role) values
      ('${ID.org}', '${ID.leaderA}', '${ID.centreA}', 'leader'),
      ('${ID.org}', '${ID.eduA1}', '${ID.centreA}', 'educator'),
      ('${ID.org}', '${ID.eduA2}', '${ID.centreA}', 'educator'),
      ('${ID.org}', '${ID.leaderB}', '${ID.centreB}', 'leader'),
      ('${ID.org}', '${ID.eduB1}', '${ID.centreB}', 'educator'),
      ('${ID.org}', '${ID.hq}', null, 'hq'),
      ('${ID.org}', '${ID.admin}', null, 'admin'),
      ('${ID.otherOrg}', '${ID.outsider}', '${ID.centreX}', 'leader'),
      ('${ID.otherOrg}', '${ID.outsiderEdu}', '${ID.centreX}', 'educator');
    insert into public.educator_profile (user_id, org_id, centre_id, age_group, peer_match_opt_in) values
      ('${ID.eduA1}', '${ID.org}', '${ID.centreA}', 'preschool', false),
      ('${ID.eduA2}', '${ID.org}', '${ID.centreA}', 'preschool', true),
      ('${ID.eduB1}', '${ID.org}', '${ID.centreB}', 'preschool', false),
      ('${ID.outsiderEdu}', '${ID.otherOrg}', '${ID.centreX}', 'preschool', false);
    insert into public.class (id, org_id, centre_id, name, level) values
      ('${ID.classA}', '${ID.org}', '${ID.centreA}', 'K1 Sunflower', 'K1');
    insert into public.class_roster (org_id, centre_id, class_id, child_name) values
      ('${ID.org}', '${ID.centreA}', '${ID.classA}', 'Wei Ling'),
      ('${ID.org}', '${ID.centreA}', '${ID.classA}', 'Arjun');

    insert into public.framework (id, org_id, code, name) values ('${ID.qtt}', null, 'QTT', 'Quality Teaching Tool');
    insert into public.framework_version (id, org_id, framework_id, version, status, activated_at)
      values ('${ID.qttV1}', null, '${ID.qtt}', '2024.1', 'active', now());
    insert into public.indicator (id, org_id, framework_version_id, code, name, domain_code, domain_name, subdomain_code, subdomain_name) values
      ('${ID.ind334}', null, '${ID.qttV1}', '3.3.4', 'Extending Thinking Through Questioning', '3', 'Facilitating Learning and Development', '3.3', 'Extending Thinking, Language and Learning'),
      ('${ID.ind111}', null, '${ID.qttV1}', '1.1.1', 'Creating a Warm, Safe and Motivating Environment', '1', 'Building Trusting Relationships', '1.1', 'Engaging in Positive Interactions'),
      ('${ID.ind342}', null, '${ID.qttV1}', '3.4.2', 'Facilitating Self-Regulation Skills', '3', 'Facilitating Learning and Development', '3.4', 'Self-Regulation and Executive Function');
  `);
}

/** Creates an active IDP for an educator with the given goal indicators. Returns goal ids. */
export async function seedActiveIdp({ db }: TestDb, educator: string, centre: string, indicators: string[]) {
  const idp = (
    await db.query<{ id: string }>(
      `insert into public.idp (org_id, centre_id, educator_id, status, educator_confirmed_at, leader_confirmed_at)
       values ($1, $2, $3, 'active', now(), now()) returning id`,
      [ID.org, centre, educator],
    )
  ).rows[0].id;
  const goals: string[] = [];
  for (const [i, ind] of indicators.entries()) {
    goals.push(
      (
        await db.query<{ id: string }>(
          `insert into public.idp_goal (org_id, idp_id, indicator_id, framework_version_id, current_level, target_level, position)
           values ($1, $2, $3, $4, 1, 2, $5) returning id`,
          [ID.org, idp, ind, ID.qttV1, i],
        )
      ).rows[0].id,
    );
  }
  return { idp, goals };
}

/** Simulates the AI pipeline (service role) finishing a draft for an observation. */
export async function seedAiDraft({ db }: TestDb, obs: string) {
  await db.query(`update public.observation set status = 'ai_draft', pipeline_step = 'done' where id = $1`, [obs]);
  const ev = (
    await db.query<{ id: string }>(
      `insert into public.evidence_unit (org_id, observation_id, idx, text, start_ms, end_ms)
       values ($1, $2, 0, 'Asked "why do you think the bear hid?" and waited for answers.', 60000, 75000) returning id`,
      [ID.org, obs],
    )
  ).rows[0].id;
  const tags = (
    await db.query<{ id: string }>(
      `insert into public.tag (org_id, observation_id, evidence_unit_id, indicator_id, framework_version_id, level, valence, confidence, reason)
       values ($1, $2, $3, $4, $5, 2, 'glow', 0.86, 'open why-question'),
              ($1, $2, $3, $6, $5, 1, 'grow', 0.40, 'possible')
       returning id`,
      [ID.org, obs, ev, ID.ind334, ID.qttV1, ID.ind342],
    )
  ).rows.map((r) => r.id);
  await db.query(
    `insert into public.narrative (org_id, observation_id, version, author, content)
     values ($1, $2, 1, 'ai', $3)`,
    [ID.org, obs, JSON.stringify(sampleContent(ev))],
  );
  await db.query(
    `insert into public.coaching_card (org_id, observation_id, educator_id, indicator_id, title, body)
     values ($1, $2, $3, $4, '3 question stems that stretch thinking', '{"why":"…"}')`,
    [ID.org, obs, ID.eduA1, ID.ind334],
  );
  return { ev, tags };
}

export function sampleContent(ev: string) {
  return {
    glows: [{ text: 'You asked an open why-question and waited for answers.', evidence_ids: [ev] }],
    grows: [{ text: 'An opportunity to build on a child’s answer with a follow-up.', evidence_ids: [ev] }],
    next_step: { text: 'Try one follow-up “what makes you think that?” at story time.', evidence_ids: [ev], goal_id: null },
  };
}
