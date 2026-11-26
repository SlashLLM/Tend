'use client';
import { PenLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { reviseIdp } from '@/app/actions/idp';

export function ReviseButton({ idpId }: { idpId: string }) {
  const [pending, start] = useTransition();
  const t = useTranslations('growth');
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
            console.error(e);
            toast.error(t('reviseFailed'));
          }
        })
      }
    >
      <PenLine aria-hidden /> {t('revise')}
    </Button>
  );
}
