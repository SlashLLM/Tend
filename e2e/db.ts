import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Read .env.local the way Next does for simple KEY=value lines (tests run outside Next). */
function envLocal(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
        .split(/\r?\n/)
        .filter((l) => /^[A-Z0-9_]+=/.test(l))
        .map((l) => {
          const i = l.indexOf('=');
          return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
        }),
    );
  } catch {
    return {};
  }
}

let client: SupabaseClient | null = null;

/** Service-role client, for checking what actually reached the database and storage. */
export function adminDb(): SupabaseClient {
  if (client) return client;
  const env = { ...envLocal(), ...process.env };
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('e2e: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed');
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export type CaptureRow = { id: string; kind: string; seq: number; t_offset_ms: number; storage_path: string | null; transcript: string | null };

export async function captureItems(observationId: string, kind: string): Promise<CaptureRow[]> {
  const { data, error } = await adminDb()
    .from('capture_item')
    .select('id, kind, seq, t_offset_ms, storage_path, transcript')
    .eq('observation_id', observationId)
    .eq('kind', kind)
    .order('seq');
  if (error) throw new Error(error.message);
  return (data ?? []) as CaptureRow[];
}

export async function downloadCapture(path: string): Promise<Buffer> {
  const { data, error } = await adminDb().storage.from('capture').download(path);
  if (error || !data) throw new Error(`download ${path}: ${error?.message ?? 'no data'}`);
  return Buffer.from(await data.arrayBuffer());
}
