'use client';
import { CalendarPlus, Hourglass, Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { requestObservation, resolveObservationRequest } from '@/app/actions/observation';

const MAX = 300;

/** Educator-initiated: ask your centre leader to observe. The leader still picks the time. */
export function RequestObservation({ open }: { open: { id: string; note: string | null } | null }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState('');

  if (open) {
    return (
      <section className="tend-card grid gap-3 p-5" aria-label="Observation requested">
        <p className="tend-dateline flex items-center gap-1.5 text-amber"><Hourglass className="size-3.5" aria-hidden /> Requested</p>
        <h2 className="text-lg font-semibold">Your leader has your request</h2>
        <p className="text-sm text-muted-foreground">
          {open.note ? <>You said: “{open.note}”. </> : null}You’ll get a notification when a time is set, then you can choose what you’d like feedback on.
        </p>
        <div>
          <Button
            variant="outline" className="min-h-11" disabled={pending}
            onClick={() => start(async () => {
              try {
                await resolveObservationRequest(open.id, 'withdraw');
                toast.success('Request withdrawn');
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Could not withdraw');
              }
            })}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />} Withdraw request
          </Button>
        </div>
      </section>
    );
  }

  return (
    <form
      className="tend-card grid gap-3 p-5"
      aria-label="Request an observation"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            await requestObservation(note);
            setNote('');
            toast.success('Request sent to your centre leader');
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not send your request');
          }
        });
      }}
    >
      <p className="tend-dateline flex items-center gap-1.5"><CalendarPlus className="size-3.5" aria-hidden /> Ready for feedback?</p>
      <h2 className="text-lg font-semibold">Ask your leader to observe you</h2>
      <div className="grid gap-1.5">
        <Label htmlFor="request-note">Anything they should know? <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Textarea id="request-note" value={note} maxLength={MAX} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Story time on Thursday, I’m trying open questions" className="min-h-20" />
        <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">{note.length}/{MAX}</p>
      </div>
      <div>
        <Button type="submit" className="min-h-11" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CalendarPlus aria-hidden />} Request an observation
        </Button>
      </div>
    </form>
  );
}
