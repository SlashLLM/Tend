import { execSync } from 'node:child_process';

/** Every e2e run starts from the same synthetic demo world. */
export default function globalSetup() {
  if (process.env.E2E_SKIP_RESET === '1') return;
  execSync('pnpm -s db:reset', { stdio: 'inherit' });
}
