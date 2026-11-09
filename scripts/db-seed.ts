/**
 * Loads the synthetic demo world into the Supabase database.
 *   pnpm db:reset   → re-applies migrations (empty DB) and then runs this script
 * 1) creates every demo user through the Auth admin API (so magic links / sign-in work)
 * 2) inserts the public data with the same ids
 */
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { buildWorld, toSql, type Row, type World } from '../supabase/seed/world';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!url || !key || !dbUrl) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_DB_URL');
  if (!/127\.0\.0\.1|localhost/.test(dbUrl) && process.env.ALLOW_REMOTE_SEED !== '1') {
    throw new Error('Refusing to seed a non-local database without ALLOW_REMOTE_SEED=1');
  }

  const world = process.argv.includes('--blank') ? blankWorld(buildWorld(new Date())) : buildWorld(new Date());
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const sql = postgres(dbUrl, { max: 1, onnotice: () => {} });

  const existing = await sql<{ n: number }[]>`select count(*)::int n from public.organisation`;
  if (existing[0].n > 0) throw new Error('Database already has data — run `pnpm db:reset` first.');

  let created = 0;
  for (const u of world.authUsers) {
    const { error } = await admin.auth.admin.createUser({ id: u.id, email: u.email, email_confirm: true });
    if (error && !/already/i.test(error.message)) throw new Error(`createUser ${u.email}: ${error.message}`);
    if (!error) created++;
  }
  await sql.unsafe(toSql(world, { includeAuthUsers: false }));
  const counts = await sql<{ t: string; n: number }[]>`
    select 'observation' t, count(*)::int n from public.observation union all
    select 'tag', count(*)::int from public.tag union all
    select 'app_user', count(*)::int from public.app_user`;
  await sql.end();
  console.log(`seeded: ${created} auth users; ${counts.map((c) => `${c.t}=${c.n}`).join(' ')}`);
}

/**
 * --blank (pnpm db:reset:blank): keep the organisation, centres, classes + rosters (for redaction), the framework
 * registry, needs-analysis templates and the PD catalogue — but only ONE person: the IT Admin.
 * Everyone else is invited through the Admin page, so testing can start from sign-up.
 */
const REFERENCE_TABLES = new Set([
  'organisation', 'centre', 'class', 'class_roster', 'framework', 'framework_version', 'indicator',
  'occupational_title', 'tsc', 'indicator_tsc_map', 'lna_template', 'pd_activity',
]);
function blankWorld(world: World): World {
  const adminId = world.ids.admin;
  const tables = world.tables
    .map(([t, rows]): [string, Row[]] => {
      if (REFERENCE_TABLES.has(t)) return [t, rows];
      if (t === 'app_user') return [t, rows.filter((r) => r.id === adminId)];
      if (t === 'membership' || t === 'consent') return [t, rows.filter((r) => r.user_id === adminId)];
      return [t, []];
    })
    .filter(([, rows]) => rows.length > 0);
  return { ...world, authUsers: world.authUsers.filter((u) => u.id === adminId), tables };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
