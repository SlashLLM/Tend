'use client';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { endorseAction } from '@/app/actions/idp';

export function EndorseButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const t = useTranslations('proposed');
  return (
    <Button size="sm" className="min-h-11" disabled={pending}
      onClick={() => start(async () => { try { await endorseAction(id); toast.success(t('endorsed')); } catch (e) { console.error(e); toast.error(t('failed')); } })}>
      {t('endorse')}
    </Button>
  );
}
