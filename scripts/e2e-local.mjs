// Run the Playwright suite against the LOCAL Docker Supabase (pnpm db:start), never the hosted one.
//
// .env.local may point at the hosted (production) project. Next.js, `node --env-file` and e2e/db.ts
// all let variables already in the process environment win over .env files, so this script pins
// every Supabase variable to the local stack before anything starts — the reset, the seed, the dev
// server and the test helpers all inherit them.
//
// Usage: pnpm e2e:local [playwright args]   e.g. pnpm e2e:local --project=desktop e2e/05-password.spec.ts
//        E2E_PROD=1 pnpm e2e:local           production build (needed for the offline spec)
import { execSync, spawnSync } from 'node:child_process';

const status = JSON.parse(execSync('pnpm exec supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }));
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  SUPABASE_DB_URL: status.DB_URL,
  SUPABASE_DB_PASSWORD: 'postgres',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3100',
  DEMO_MODE: '1',
  ALLOW_REMOTE_SEED: '', // never
  // Let offline emulation and routing apply to the service worker's own requests (e2e/08-offline).
  PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS: '1',
  E2E_REMOTE: '',
};
if (process.env.E2E_LIVE_AI !== '1') {
  env.AI_FORCE_OFFLINE = '1';
  env.OPENAI_API_KEY = '';
}

for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_DB_URL']) {
  if (!/^(https?|postgresql):\/\/[^/]*(127\.0\.0\.1|localhost)[:/]/.test(env[k] ?? '')) {
    console.error(`e2e:local: ${k}=${env[k]} is not local — refusing to run.`);
    process.exit(1);
  }
}
console.log(`e2e:local → ${env.NEXT_PUBLIC_SUPABASE_URL} (db ${env.SUPABASE_DB_URL.replace(/:[^:@]*@/, ':***@')})`);

const projects = process.argv.slice(2).some((a) => a.startsWith('--project')) ? [[]] : [['--project=desktop'], ['--project=mobile']];
let code = 0;
for (const p of projects) {
  const r = spawnSync('pnpm', ['exec', 'playwright', 'test', ...p, ...process.argv.slice(2)], { env, stdio: 'inherit', shell: true });
  code ||= r.status ?? 1;
}
process.exit(code);
