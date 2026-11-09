import { NextResponse, type NextRequest } from 'next/server';
import { safeNext } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';

/** Magic-link landing: exchange the code for a session, then go to a safe relative path. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const next = safeNext(req.nextUrl.searchParams.get('next'), '/');
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, req.nextUrl.origin));
  }
  return NextResponse.redirect(new URL('/login?error=link', req.nextUrl.origin));
}
