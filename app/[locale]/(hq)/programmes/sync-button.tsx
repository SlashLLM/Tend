'use client';
import { Loader2, RefreshCw } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { syncNow } from '@/app/actions/catalogue';
import { Button } from '@/components/ui/button';

export function SyncButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const id = toast.loading('Syncing from SkillsFuture… this can take a minute.');
          try {
            const r = await syncNow();
            toast.success(`Synced: ${r.fetched} courses in the feed, ${r.inserted} new, ${r.tagged} tagged${r.pendingUntagged ? `, ${r.pendingUntagged} still to tag` : ''}.`, { id });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Sync failed', { id });
          }
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} Sync now
    </Button>
  );
}
