import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { aiMode } from './availability';
import type { AiRunRecord, Gateway } from './gateway';
import { getGateway } from './index';

/** Gateway that logs every call to ai_run, or null in offline mode. */
export function serverGateway(): Gateway | null {
  if (aiMode() === 'offline') return null;
  return getGateway(async (run: AiRunRecord) => {
    await createAdminClient().from('ai_run').insert(run);
  });
}
