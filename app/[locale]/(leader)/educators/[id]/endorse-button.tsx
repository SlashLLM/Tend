'use client';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { endorseAction } from '@/app/actions/idp';

export function EndorseButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" className="min-h-11" disabled={pending}
      onClick={() => start(async () => { try { await endorseAction(id); toast.success('Endorsed'); } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); } })}>
      Endorse
    </Button>
  );
}
