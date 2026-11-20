import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DEMO_PERSONAS } from '@/lib/auth/demo';
import { createAdminClient } from '@/lib/supabase/admin';
import { supabaseConfigured } from '@/lib/supabase/env';
import { SetupNotice } from '@/components/shell/setup-notice';
import { demoSignIn } from './actions';
import { LoginForm } from './login-form';

export default async function LoginPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string }> }) {
  const { locale } = await params;
  const { next } = await searchParams;
  setRequestLocale(locale);
  if (!supabaseConfigured()) return <SetupNotice />;
  const t = await getTranslations();
  const demo = process.env.DEMO_MODE === '1';
  // Only offer personas that exist (after `pnpm db:reset:blank` only the admin is left).
  let personas: readonly (typeof DEMO_PERSONAS)[number][] = [];
  if (demo) {
    const { data, error } = await createAdminClient().from('app_user').select('email').in('email', DEMO_PERSONAS.map((p) => p.email));
    if (error) console.error('demo personas: lookup failed:', error.message);
    const existing = new Set((data ?? []).map((u) => u.email));
    personas = DEMO_PERSONAS.filter((p) => existing.has(p.email));
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <p className="font-heading text-3xl font-semibold text-primary">{t('app.name')}</p>
        <p className="text-muted-foreground">{t('app.tagline')}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle><h1 className="text-xl">{t('auth.title')}</h1></CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm next={next ?? ''} />
        </CardContent>
      </Card>
      {demo && personas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle><h2 className="text-base">{t('auth.demo')}</h2></CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {personas.map((p) => (
              <form key={p.email} action={demoSignIn}>
                <input type="hidden" name="email" value={p.email} />
                <input type="hidden" name="locale" value={locale} />
                <button type="submit" className="flex min-h-11 w-full items-center justify-between rounded-lg border bg-card px-3 py-2 text-left hover:border-primary">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-sm text-muted-foreground">{p.role}</span>
                </button>
              </form>
            ))}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
