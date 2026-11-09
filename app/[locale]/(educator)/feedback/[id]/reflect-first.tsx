'use client';
import { Loader2, Lock } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { submitReflection } from '@/app/actions/feedback';

/** Reflect FIRST (PRD M4.16): the notes unlock only after the educator's own reflection. */
export function ReflectFirst({ obsId, reviewer }: { obsId: string; reviewer: string }) {
  const [text, setText] = useState('');
  const [pending, start] = useTransition();
  return (
    <section className="tend-card grid gap-4 p-6" aria-labelledby="reflect-h">
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="size-4" aria-hidden /> Notes from {reviewer} are ready</p>
      <h2 id="reflect-h" className="text-xl font-semibold">Before you read them: how do you think it went?</h2>
      <p className="text-muted-foreground">A sentence or two is plenty. You can use your keyboard’s microphone to speak it.</p>
      <Textarea aria-label="Your reflection" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. The children were quiet when I asked why…" className="min-h-28" maxLength={2000} />
      <Button
        className="min-h-11 justify-self-start"
        disabled={pending || text.trim().length < 3}
        onClick={() =>
          start(async () => {
            try {
              await submitReflection(obsId, text);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Could not save');
            }
          })
        }
      >
        {pending && <Loader2 className="animate-spin" aria-hidden />} Save reflection and read my notes
      </Button>
    </section>
  );
}
