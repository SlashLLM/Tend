import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { serverGateway } from '@/lib/ai/server';
import { syncCatalogue } from '@/lib/catalogue/sync';
import { createAdminClient } from '@/lib/supabase/admin';

// Downloads ~16 MB of open data and asks the AI to tag new courses: give it room.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // never open: no secret configured → refuse
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Monthly Vercel cron (see vercel.json): refresh the programmes catalogue from SkillsFuture open data. */
export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  try {
    const result = await syncCatalogue({ admin: createAdminClient(), gateway: serverGateway(), trigger: 'cron' });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
