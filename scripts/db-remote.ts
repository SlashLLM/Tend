/**
 * Hosted Supabase without Docker or the Supabase CLI login (for a TEST project, e.g. e2e before deploy).
 *
 *   pnpm db:remote migrate   → apply supabase/migrations/*.sql not yet applied (recorded like `supabase db push`)
 *   pnpm db:remote reset     → wipe ALL app data, auth users and capture media, then load the demo world
 *
 * Both need SUPABASE_DB_URL + ALLOW_REMOTE_SEED=1. `reset` additionally needs CONFIRM_RESET=<project ref>
 * so it can't be pointed at production by accident.
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';

const MIGRATIONS = join(__dirname, '..', 'supabase', 'migrations');

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Set ${name}`);
  return v;
}

async function migrate(sql: postgres.Sql) {
  await sql`create schema if not exists supabase_migrations`;
  await sql`create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)`;
  const done = new Set((await sql<{ version: string }[]>`select version from supabase_migrations.schema_migrations`).map((r) => r.version));
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    const [version, ...rest] = f.replace(/\.sql$/, '').split('_');
    if (done.has(version)) continue;
    const body = readFileSync(join(MIGRATIONS, f), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into supabase_migrations.schema_migrations (version, statements, name) values (${version}, ${[body]}, ${rest.join('_')})`;
    });
    console.log(`applied ${f}`);
  }
  console.log('migrations up to date');
}

async function reset(sql: postgres.Sql) {
  const ref = new URL(env('NEXT_PUBLIC_SUPABASE_URL')).hostname.split('.')[0];
  if (process.env.CONFIRM_RESET !== ref) throw new Error(`Refusing to wipe project "${ref}": set CONFIRM_RESET=${ref}`);
  const tables = await sql<{ t: string }[]>`select quote_ident(tablename) t from pg_tables where schemaname = 'public'`;
  if (tables.length) await sql.unsafe(`truncate ${tables.map((r) => `public.${r.t}`).join(', ')} restart identity cascade`);
  await sql`delete from auth.users`;

  const admin = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: bucket } = await admin.storage.getBucket('capture');
  if (bucket) await admin.storage.emptyBucket('capture');
  console.log(`wiped ${tables.length} tables, auth users and capture media`);

  execSync('tsx scripts/db-seed.ts', { stdio: 'inherit', env: process.env });
}

async function main() {
  const cmd = process.argv[2];
  if (cmd !== 'migrate' && cmd !== 'reset') throw new Error('Usage: pnpm db:remote <migrate|reset>');
  if (process.env.ALLOW_REMOTE_SEED !== '1') throw new Error('Set ALLOW_REMOTE_SEED=1 to work on a hosted database');
  const sql = postgres(env('SUPABASE_DB_URL'), { max: 1, ssl: 'require', onnotice: () => {} });
  try {
    if (cmd === 'migrate') await migrate(sql);
    else await reset(sql);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
