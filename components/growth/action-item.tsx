'use client';
import { CalendarCheck, CheckCircle2, CircleDashed, Hourglass, Loader2, Users } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { setActionStatus } from '@/app/actions/idp';
import { cancelPeerObservation, completePeerObservation, requestPeerObservation } from '@/app/actions/peer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { actionStage, currentPeerSession, type ActionView } from '@/lib/peer';

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' });
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
/** <input type="datetime-local"> value (browser-local) → ISO with offset. */
const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

/**
 * One plan action. The educator (owner) can mark it done, or, for a Peer Match action, ask the colleague,
 * see the booking and record what they noticed. Leaders see the same state, read-only.
 */
export function ActionItem({ action: a, canAct }: { action: ActionView; canAct: boolean }) {
  const [pending, start] = useTransition();
  const [form, setForm] = useState<null | 'done' | 'ask' | 'reflect'>(null);
  const [note, setNote] = useState('');
  const [when, setWhen] = useState('');
  const [noticed, setNoticed] = useState('');
  const [willTry, setWillTry] = useState('');
  const stage = actionStage(a, new Date());
  const session = currentPeerSession(a);
  const peerFirst = a.peer?.full_name.split(' ')[0] ?? 'your colleague';

  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        setForm(null);
        setNote('');
        setWhen('');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Something went wrong');
      }
    });

  const icon =
    stage === 'done' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
    : stage === 'booked' || stage === 'reflect' ? <CalendarCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
    : stage === 'requested' ? <Hourglass className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden />
    : a.peer_user_id ? <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
    : <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />;

  return (
    <li className="flex items-start gap-2 text-sm">
      {icon}
      <div className="grid min-w-0 flex-1 gap-1.5">
        <span>
          {a.description}
          {stage === 'awaiting_endorsement' && <span className="ml-2 rounded-full bg-amber/15 px-2 text-xs text-amber">waiting for endorsement</span>}
        </span>

        {/* state line */}
        {stage === 'done' && (
          <span className="text-xs text-muted-foreground">
            Done{a.completed_at ? ` ${fmtDay(a.completed_at)}` : ''}
            {a.cpd_minutes ? ` · ${a.cpd_minutes} CPD minutes` : ''}
            {session?.status === 'done' && session.will_try ? ` · I’ll try: ${session.will_try}` : a.completion_note ? ` · ${a.completion_note}` : ''}
          </span>
        )}
        {stage === 'done' && session?.status === 'done' && session.noticed && (
          <blockquote className="border-l-2 border-primary/30 pl-3 text-xs text-muted-foreground">Noticed: {session.noticed}</blockquote>
        )}
        {stage === 'ask' && session?.status === 'declined' && (
          <span className="text-xs text-muted-foreground">{peerFirst} couldn’t this time{session.peer_note ? `: “${session.peer_note}”` : ''}. You can ask again.</span>
        )}
        {stage === 'requested' && <span className="text-xs text-amber">Asked {peerFirst}{session?.proposed_at ? ` for ${fmt(session.proposed_at)}` : ''}. Waiting for a reply.</span>}
        {(stage === 'booked' || stage === 'reflect') && session?.scheduled_at && (
          <span className="text-xs text-primary">
            Booked with {peerFirst}: {fmt(session.scheduled_at)}{session.peer_note ? ` · “${session.peer_note}”` : ''}
          </span>
        )}

        {/* controls (owner only) */}
        {canAct && !form && (
          <span className="flex flex-wrap gap-2">
            {stage === 'open' && <Button type="button" size="sm" variant="outline" className="min-h-9" disabled={pending} onClick={() => setForm('done')}>Mark done</Button>}
            {stage === 'done' && !a.peer_user_id && (
              <Button type="button" size="sm" variant="ghost" className="min-h-9" disabled={pending} onClick={() => run(() => setActionStatus(a.id, 'open'), 'Moved back to open')}>Undo</Button>
            )}
            {stage === 'ask' && <Button type="button" size="sm" className="min-h-9" disabled={pending} onClick={() => setForm('ask')}>Ask {peerFirst}</Button>}
            {stage === 'reflect' && <Button type="button" size="sm" className="min-h-9" disabled={pending} onClick={() => setForm('reflect')}>Record what you noticed</Button>}
            {(stage === 'requested' || stage === 'booked' || stage === 'reflect') && session && (
              <Button type="button" size="sm" variant="ghost" className="min-h-9" disabled={pending} onClick={() => run(() => cancelPeerObservation(session.id), 'Cancelled')}>Cancel</Button>
            )}
            {pending && <Loader2 className="size-4 animate-spin self-center" aria-label="Saving" />}
          </span>
        )}

        {form === 'done' && (
          <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); run(() => setActionStatus(a.id, 'done', note.trim() || undefined), 'Marked done'); }}>
            <Label htmlFor={`note-${a.id}`} className="text-xs">How did it go? <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id={`note-${a.id}`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className="min-h-10" placeholder="One line for your record" />
            <FormButtons pending={pending} label="Mark done" onCancel={() => setForm(null)} />
          </form>
        )}

        {form === 'ask' && (
          <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); run(() => requestPeerObservation(a.id, toIso(when), note.trim() || undefined), `Request sent to ${peerFirst}`); }}>
            <p className="text-xs text-muted-foreground">{peerFirst} will be asked to let you watch for 15 minutes. They choose the time if you don’t suggest one.</p>
            <Label htmlFor={`when-${a.id}`} className="text-xs">Suggest a time <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id={`when-${a.id}`} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="min-h-10" />
            <Label htmlFor={`msg-${a.id}`} className="text-xs">Message <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id={`msg-${a.id}`} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className="min-h-10" placeholder="e.g. I’d love to see your story-time questions" />
            <FormButtons pending={pending} label={`Ask ${peerFirst}`} onCancel={() => setForm(null)} />
          </form>
        )}

        {form === 'reflect' && session && (
          <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); run(() => completePeerObservation(session.id, noticed, willTry), 'Recorded: 15 CPD minutes logged'); }}>
            <Label htmlFor={`noticed-${a.id}`} className="text-xs">What did you notice {peerFirst} doing?</Label>
            <Textarea id={`noticed-${a.id}`} value={noticed} maxLength={1000} onChange={(e) => setNoticed(e.target.value)} className="min-h-20" required minLength={10}
              placeholder="e.g. She asked “what do you think will happen?” and waited before calling on anyone" />
            <Label htmlFor={`try-${a.id}`} className="text-xs">One thing you’ll try</Label>
            <Input id={`try-${a.id}`} value={willTry} maxLength={500} onChange={(e) => setWillTry(e.target.value)} className="min-h-10" required minLength={3}
              placeholder="e.g. Count to five after each question" />
            <FormButtons pending={pending} label="Save and complete" onCancel={() => setForm(null)} />
          </form>
        )}
      </div>
    </li>
  );
}

function FormButtons({ pending, label, onCancel }: { pending: boolean; label: string; onCancel: () => void }) {
  return (
    <span className="flex gap-2">
      <Button type="submit" size="sm" className="min-h-9" disabled={pending}>{pending && <Loader2 className="animate-spin" aria-hidden />} {label}</Button>
      <Button type="button" size="sm" variant="ghost" className="min-h-9" onClick={onCancel}>Cancel</Button>
    </span>
  );
}
