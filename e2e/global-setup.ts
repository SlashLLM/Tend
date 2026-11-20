import { execSync } from 'node:child_process';

/**
 * Every e2e run starts from the same synthetic demo world.
 * Local (default): `supabase db reset` + seed (needs Docker).
 * Hosted TEST project: E2E_REMOTE=1 ALLOW_REMOTE_SEED=1 CONFIRM_RESET=<project ref> pnpm e2e
 */
export default function globalSetup() {
  if (process.env.E2E_SKIP_RESET === '1') return;
  execSync(process.env.E2E_REMOTE === '1' ? 'pnpm -s db:remote reset' : 'pnpm -s db:reset', { stdio: 'inherit' });
}
