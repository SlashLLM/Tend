'use client';
import { Check, Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LevelStones } from '@/components/tend/level-stones';
import { cn } from '@/lib/utils';
import { setFocus } from '@/app/actions/observation';

type Goal = { id: string; code: string; name: string; current: number | null; target: number };

export function FocusForm({ obsId, goals, initial, initialNote }: { obsId: string; goals: Goal[]; initial: string[]; initialNote: string }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(initial);
  const [note, setNote] = useState(initialNote);
  const [pending, start] = useTransition();

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 2 ? p : [...p, id]));

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            await setFocus(obsId, picked, note);
            toast.success('Your focus is set');
            router.push('/home');
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not save');
          }
        });
      }}
    >
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm text-muted-foreground">{picked.length}/2 chosen</legend>
        {goals.length === 0 && <p className="text-muted-foreground">You don’t have an active plan yet — your observer will choose look-fors with you.</p>}
        {goals.map((g) => {
          const on = picked.includes(g.id);
          const full = !on && picked.length >= 2;
          return (
            <label key={g.id} className={cn('tend-card flex cursor-pointer items-center gap-4 p-4 transition-colors', on && 'border-primary ring-1 ring-primary', full && 'cursor-not-allowed opacity-50')}>
              <input type="checkbox" className="sr-only" checked={on} disabled={full} onChange={() => toggle(g.id)} />
              <span aria-hidden className={cn('grid size-6 shrink-0 place-items-center rounded-md border-2', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                {on && <Check className="size-4" />}
              </span>
              <span className="grid flex-1 gap-1">
                <span className="font-medium"><span className="tabular-nums text-muted-foreground">{g.code}</span> {g.name}</span>
                <LevelStones level={g.current} target={g.target} size="sm" />
              </span>
            </label>
          );
        })}
      </fieldset>
      <div className="grid gap-2">
        <Label htmlFor="note">Anything your observer should know? (optional)</Label>
        <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. I’m trying open questions at story time" />
      </div>
      <Button type="submit" className="min-h-11 justify-self-start" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden />} Save my focus
      </Button>
    </form>
  );
}
