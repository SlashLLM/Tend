'use client';
import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signIn, type LoginState } from './actions';

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations('auth');
  const locale = useLocale();
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, { status: 'idle' });

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="locale" value={locale} />
      <Label htmlFor="email">{t('email')}</Label>
      <Input id="email" name="email" type="email" autoComplete="username" inputMode="email" required defaultValue={state.email} className="min-h-11" />
      <Label htmlFor="password">{t('password')}</Label>
      <Input id="password" name="password" type="password" autoComplete="current-password" required className="min-h-11" />
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-destructive">{t('invalid')}</p>
      )}
      <Button type="submit" disabled={pending} className="min-h-11">
        {t('signIn')}
      </Button>
      <p className="text-sm text-muted-foreground">{t('forgot')}</p>
    </form>
  );
}
