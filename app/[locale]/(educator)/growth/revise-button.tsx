'use client';
import { PenLine } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { reviseIdp } from '@/app/actions/idp';

export function ReviseButton({ idpId }: { idpId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      className="min-h-11"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            await reviseIdp(idpId);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not start a revision');
          }
        })
      }
    >
      <PenLine aria-hidden /> Revise plan
    </Button>
  );
}
