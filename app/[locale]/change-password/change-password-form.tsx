'use client';
import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PASSWORD_MIN } from '@/lib/auth/password';
import { changePassword, type ChangeState } from './actions';

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const t = useTranslations('password');
  const locale = useLocale();
  const [state, action, pending] = useActionState<ChangeState, FormData>(changePassword, { status: 'idle' });

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="locale" value={locale} />
      {!forced && (
        <>
          <Label htmlFor="current">{t('current')}</Label>
          <Input id="current" name="current" type="password" autoComplete="current-password" required className="min-h-11" />
        </>
      )}
      <Label htmlFor="password">{t('new')}</Label>
      <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} aria-describedby="pw-hint" className="min-h-11" />
      <p id="pw-hint" className="text-sm text-muted-foreground">{t('hint', { min: PASSWORD_MIN })}</p>
      <Label htmlFor="confirm">{t('confirm')}</Label>
      <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="min-h-11" />
      {state.status === 'error' && state.problem && (
        <p role="alert" className="text-sm text-destructive">{t(`problem.${state.problem}`, { min: PASSWORD_MIN })}</p>
      )}
      <Button type="submit" disabled={pending} className="min-h-11">{t('save')}</Button>
    </form>
  );
}
