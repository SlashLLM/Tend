'use client';
import { Check, X } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { decideSuggestion } from '@/app/actions/idp';

type Item = { id: string; kind: string; code: string; name: string; from: number; to: number | null; level: number | null };

/** Suggested IDP updates — the leader accepts or declines; nothing changes automatically (PRD M3.5). */
export function Suggestions({ items }: { items: Item[] }) {
  const [pending, start] = useTransition();
  const decide = (id: string, accept: boolean) =>
    start(async () => {
      try {
        await decideSuggestion(id, accept);
        toast.success(accept ? 'Plan updated — a new version was saved' : 'Suggestion declined');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Something went wrong');
      }
    });
  return (
    <ul className="grid gap-2">
      {items.map((s) => (
        <li key={s.id} className="tend-card flex flex-col gap-3 border-l-4 border-l-amber p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            <span className="font-medium">{s.code} {s.name}</span>
            <br />
            {s.kind === 'raise_target'
              ? `Seen at Level ${s.level}. Raise the aim from Level ${s.from} to Level ${s.to}?`
              : `Seen at Level ${s.level}. Update the current level?`}
          </p>
          <span className="flex gap-2">
            <Button size="sm" className="min-h-11" disabled={pending} onClick={() => decide(s.id, true)}><Check aria-hidden /> Accept</Button>
            <Button size="sm" variant="outline" className="min-h-11" disabled={pending} onClick={() => decide(s.id, false)}><X aria-hidden /> Decline</Button>
          </span>
        </li>
      ))}
    </ul>
  );
}
