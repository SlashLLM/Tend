'use client';
import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sendMagicLink, type LoginState } from './actions';

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations('auth');
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: 'idle' });

  if (state.status === 'sent') {
    return <p role="status" className="text-success">{t('sent')}</p>;
  }
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="next" value={next} />
      <Label htmlFor="email">{t('email')}</Label>
      <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required className="min-h-11" />
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-destructive">{t('error')}</p>
      )}
      <Button type="submit" disabled={pending} className="min-h-11">
        {t('send')}
      </Button>
    </form>
  );
}
