/**
 * Sync the programmes catalogue from SkillsFuture open data (data.gov.sg) into the configured Supabase project.
 *
 *   pnpm catalogue:sync              → sync, AI-tag up to 60 new courses
 *   pnpm catalogue:sync --tag-all    → sync and tag every untagged course (first load)
 *   pnpm catalogue:sync --no-ai      → sync only
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (and OPENAI_API_KEY for tagging), read from .env.local.
 */
import { createClient } from '@supabase/supabase-js';
import { createOpenAI } from '@ai-sdk/openai';
import { createGateway } from '../lib/ai/gateway';
import { syncCatalogue } from '../lib/catalogue/sync';

async function main() {
  const args = new Set(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const apiKey = process.env.OPENAI_API_KEY;
  const gateway =
    args.has('--no-ai') || !apiKey
      ? null
      : (() => {
          const openai = createOpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL || undefined });
          return createGateway({
            resolveModel: (id) => openai(id),
            logRun: async (r) => void (await admin.from('ai_run').insert(r)),
            provider: 'openai',
            region: process.env.AI_REGION ?? 'unconfirmed',
          });
        })();
  if (!gateway) console.log('AI tagging off (no OPENAI_API_KEY or --no-ai): courses will wait for manual tagging.');
  const t = Date.now();
  const r = await syncCatalogue({ admin, gateway, trigger: 'cli', tagLimit: args.has('--tag-all') ? 10_000 : 60 });
  console.log(`Synced in ${Math.round((Date.now() - t) / 1000)}s:`, r);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
