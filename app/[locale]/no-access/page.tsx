import { getTranslations } from 'next-intl/server';

export default async function NoAccess() {
  const t = await getTranslations();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-4">
      <h1 className="text-2xl font-semibold">{t('noAccess.title')}</h1>
      <p className="text-muted-foreground">{t('noAccess.body')}</p>
      <form action="/auth/signout" method="post"><button className="min-h-11 text-primary underline">{t('auth.signOut')}</button></form>
    </main>
  );
}
