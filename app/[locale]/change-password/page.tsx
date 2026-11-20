import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { mustChangePassword } from '@/lib/auth/password';
import { createClient } from '@/lib/supabase/server';
import { ChangePasswordForm } from './change-password-form';

export const metadata = { title: 'Change password' };

export default async function ChangePasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(locale === 'en' ? '/login' : `/${locale}/login`);
  const forced = mustChangePassword(user);
  const t = await getTranslations();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <p className="text-center font-heading text-3xl font-semibold text-primary">{t('app.name')}</p>
      <Card>
        <CardHeader>
          <CardTitle><h1 className="text-xl">{t(forced ? 'password.titleFirst' : 'password.title')}</h1></CardTitle>
          {forced && <p className="text-sm text-muted-foreground">{t('password.introFirst')}</p>}
        </CardHeader>
        <CardContent>
          <ChangePasswordForm forced={forced} />
        </CardContent>
      </Card>
      <form action="/auth/signout" method="post" className="text-center">
        <button className="min-h-11 text-sm text-primary underline">{t('auth.signOut')}</button>
      </form>
    </main>
  );
}
