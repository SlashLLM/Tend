import { createServerClient } from '@supabase/ssr';
import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { LOCALE_PREFIX_RE, routing } from './i18n/routing';
import { mustChangePassword } from './lib/auth/password';

const intl = createIntlMiddleware(routing);

/** Paths reachable without signing in (locale prefix stripped). */
const PUBLIC = [/^\/login(\/|$)/, /^\/no-access(\/|$)/];

function stripLocale(pathname: string) {
  return pathname.replace(LOCALE_PREFIX_RE, '') || '/';
}

export async function middleware(req: NextRequest) {
  // 1) locale routing
  const res = intl(req);
  if (res.headers.get('location')) return res; // intl redirect (e.g. /en/x → /x)

  // 2) refresh the Supabase session cookie and gate private pages
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return res; // not configured yet: pages render a setup notice

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (toSet) => toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = stripLocale(req.nextUrl.pathname);
  if (!user && !PUBLIC.some((r) => r.test(path))) {
    const login = req.nextUrl.clone();
    const prefix = req.nextUrl.pathname.match(LOCALE_PREFIX_RE)?.[0] ?? '';
    login.pathname = `${prefix}/login`;
    login.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
    const redirect = NextResponse.redirect(login);
    res.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  // Signed in with a temporary password: choose your own before using the app.
  if (user && mustChangePassword(user) && !/^\/change-password(\/|$)/.test(path)) {
    const change = req.nextUrl.clone();
    change.pathname = `${req.nextUrl.pathname.match(LOCALE_PREFIX_RE)?.[0] ?? ''}/change-password`;
    change.search = '';
    const redirect = NextResponse.redirect(change);
    res.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return res;
}

export const config = {
  // Everything except API routes, /auth (sign-out), Next internals and static files.
  matcher: ['/((?!api|auth|_next|_vercel|.*\\..*).*)'],
};
