'use client';
import { Loader2, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { syncNow } from '@/app/actions/catalogue';
import { Button } from '@/components/ui/button';

export function SyncButton() {
  const [pending, start] = useTransition();
  const t = useTranslations('programmes');
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const id = toast.loading(t('syncing'));
          try {
            const r = await syncNow();
            toast.success(`${t('synced', { fetched: r.fetched, inserted: r.inserted, tagged: r.tagged })}${r.pendingUntagged ? t('stillToTag', { n: r.pendingUntagged }) : ''}`, { id });
          } catch (err) {
            console.error(err);
            toast.error(t('syncFailed'), { id });
          }
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} {t('syncNow')}
    </Button>
  );
}
