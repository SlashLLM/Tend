'use client';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { createLearningGroup } from '@/app/actions/insights';

export function CreateGroup(p: { centreId: string; name: string; subdomain: string; memberIds: string[]; leadIds: string[]; pdActivityId: string | null }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="outline" className="min-h-11 justify-self-start" disabled={pending || p.memberIds.length === 0}
      onClick={() => start(async () => {
        try {
          await createLearningGroup(p);
          toast.success('Learning group created');
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Could not create');
        }
      })}>
      Build this learning group
    </Button>
  );
}
