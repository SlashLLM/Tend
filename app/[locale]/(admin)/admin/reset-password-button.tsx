'use client';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { resetUserPassword } from '@/app/actions/admin';
import { TempPassword } from './temp-password';

export function ResetPasswordButton({ userId, name }: { userId: string; name: string }) {
  const [stage, setStage] = useState<'idle' | 'confirm'>('idle');
  const [temp, setTemp] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const t = useTranslations('admin');
  const tc = useTranslations('common');

  if (temp) return <TempPassword who={name} password={temp} onDone={() => setTemp(null)} />;
  if (stage === 'idle') {
    return <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => setStage('confirm')} aria-label={t('resetFor', { name })}>{t('reset')}</Button>;
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="destructive" size="sm" className="min-h-11" disabled={pending} onClick={() => start(async () => {
        try {
          const { tempPassword } = await resetUserPassword(userId);
          setTemp(tempPassword);
          setStage('idle');
        } catch (err) {
          console.error(err);
          toast.error(t('resetFailed'));
        }
      })}>
        {pending && <Loader2 className="animate-spin" aria-hidden />} {t('confirmReset')}
      </Button>
      <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => setStage('idle')}>{tc('cancel')}</Button>
    </span>
  );
}
