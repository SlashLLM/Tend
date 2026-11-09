'use client';
import { Check, Plus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { addAction } from '@/app/actions/idp';

/** Educator proposes; the Centre Leader endorses (PRD M6.6). */
export function AddToPlan({ goalId, title, pdActivityId, already }: { goalId: string; title: string; pdActivityId: string | null; already: boolean }) {
  const [added, setAdded] = useState(already);
  const [pending, start] = useTransition();
  if (added) return <span className="flex items-center gap-1 text-sm text-muted-foreground"><Check className="size-4" aria-hidden /> In your plan</span>;
  return (
    <Button variant="outline" className="min-h-11" disabled={pending}
      onClick={() => start(async () => {
        try {
          await addAction(goalId, title, 'pathway', pdActivityId ?? undefined);
          setAdded(true);
          toast.success('Added — waiting for your leader to endorse');
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Could not add');
        }
      })}>
      <Plus aria-hidden /> Add to my plan
    </Button>
  );
}
