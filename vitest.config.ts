import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    // DB tests boot a WASM Postgres per file; give them room.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    projects: [
      {
        extends: true,
        test: { name: 'unit', environment: 'node', include: ['lib/**/*.test.ts', 'supabase/**/*.test.ts', 'evals/**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['components/**/*.test.tsx', 'app/**/*.test.tsx'],
          setupFiles: ['./test/setup-dom.ts'],
        },
      },
    ],
  },
});
