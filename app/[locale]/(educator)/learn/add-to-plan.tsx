'use client';
import { Check, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { addAction } from '@/app/actions/idp';

/** Educator proposes; the Centre Leader endorses (PRD M6.6). */
export function AddToPlan({ goalId, title, pdActivityId, peerUserId = null, already }: { goalId: string; title: string; pdActivityId: string | null; peerUserId?: string | null; already: boolean }) {
  const [added, setAdded] = useState(already);
  const [pending, start] = useTransition();
  const t = useTranslations('learn');
  if (added) return <span className="flex items-center gap-1 text-sm text-muted-foreground"><Check className="size-4" aria-hidden /> {t('inPlan')}</span>;
  return (
    <Button variant="outline" className="min-h-11" disabled={pending}
      onClick={() => start(async () => {
        try {
          await addAction(goalId, title, 'pathway', pdActivityId ?? undefined, peerUserId ?? undefined);
          setAdded(true);
          toast.success(peerUserId ? t('addedPeer') : t('added'));
        } catch (e) {
          console.error(e);
          toast.error(t('addFailed'));
        }
      })}>
      <Plus aria-hidden /> {t('add')}
    </Button>
  );
}
