'use client';
import { Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { resetUserPassword } from '@/app/actions/admin';
import { TempPassword } from './temp-password';

export function ResetPasswordButton({ userId, name }: { userId: string; name: string }) {
  const [stage, setStage] = useState<'idle' | 'confirm'>('idle');
  const [temp, setTemp] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (temp) return <TempPassword who={name} password={temp} onDone={() => setTemp(null)} />;
  if (stage === 'idle') {
    return <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => setStage('confirm')} aria-label={`Reset password for ${name}`}>Reset password</Button>;
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="destructive" size="sm" className="min-h-11" disabled={pending} onClick={() => start(async () => {
        try {
          const { tempPassword } = await resetUserPassword(userId);
          setTemp(tempPassword);
          setStage('idle');
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Could not reset the password');
        }
      })}>
        {pending && <Loader2 className="animate-spin" aria-hidden />} Confirm reset
      </Button>
      <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => setStage('idle')}>Cancel</Button>
    </span>
  );
}
