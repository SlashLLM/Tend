import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Progress rows are UI hints: never block the pipeline on them. Latest step wins, writes are
 * serialised, and `flush()` must run before any final status write so a stale step can't land after it.
 */
export function makeProgressWriter(admin: SupabaseClient, observationId: string) {
  let latest: string | null = null;
  let running: Promise<void> | null = null;
  const drain = async () => {
    try {
      while (latest !== null) {
        const step = latest;
        latest = null;
        try {
          await admin.from('observation').update({ pipeline_step: step }).eq('id', observationId);
        } catch {
          /* progress is best-effort */
        }
      }
    } finally {
      running = null;
    }
  };
  return {
    set(step: string) {
      latest = step;
      running ??= drain();
    },
    async flush() {
      while (running) await running;
    },
  };
}
