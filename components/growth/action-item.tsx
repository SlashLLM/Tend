'use client';
import { CalendarCheck, CheckCircle2, CircleDashed, Hourglass, Loader2, Users } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { setActionStatus } from '@/app/actions/idp';
import { cancelPeerObservation, completePeerObservation, requestPeerObservation } from '@/app/actions/peer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { actionStage, currentPeerSession, type ActionView } from '@/lib/peer';

/** <input type="datetime-local"> value (browser-local) → ISO with offset. */
const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

/**
 * One plan action. The educator (owner) can mark it done, or, for a Peer Match action, ask the colleague,
 * see the booking and record what they noticed. Leaders see the same state, read-only.
 */
export function ActionItem({ action: a, canAct }: { action: ActionView; canAct: boolean }) {
  const [pending, start] = useTransition();
  const t = useTranslations('action');
  const tc = useTranslations('common');
  const tw = useTranslations('workspace');
  const format = useFormatter();
  const fmt = (iso: string) => format.dateTime(new Date(iso), { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const fmtDay = (iso: string) => format.dateTime(new Date(iso), { day: 'numeric', month: 'short' });
  const [form, setForm] = useState<null | 'done' | 'ask' | 'reflect'>(null);
  const [note, setNote] = useState('');
  const [when, setWhen] = useState('');
  const [noticed, setNoticed] = useState('');
  const [willTry, setWillTry] = useState('');
  const stage = actionStage(a, new Date());
  const session = currentPeerSession(a);
  const peerFirst = a.peer?.full_name.split(' ')[0] ?? t('yourColleague');

  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        setForm(null);
        setNote('');
        setWhen('');
      } catch (e) {
        console.error(e);
        toast.error(tw('error'));
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
          {stage === 'awaiting_endorsement' && <span className="ml-2 rounded-full bg-amber/15 px-2 text-xs text-amber">{t('awaiting')}</span>}
        </span>

        {/* state line */}
        {stage === 'done' && (
          <span className="text-xs text-muted-foreground">
            {t('done')}{a.completed_at ? ` ${fmtDay(a.completed_at)}` : ''}
            {a.cpd_minutes ? t('cpd', { n: a.cpd_minutes }) : ''}
            {session?.status === 'done' && session.will_try ? t('willTry', { text: session.will_try }) : a.completion_note ? ` · ${a.completion_note}` : ''}
          </span>
        )}
        {stage === 'done' && session?.status === 'done' && session.noticed && (
          <blockquote className="border-l-2 border-primary/30 pl-3 text-xs text-muted-foreground">{t('noticed', { text: session.noticed })}</blockquote>
        )}
        {stage === 'ask' && session?.status === 'declined' && (
          <span className="text-xs text-muted-foreground">{t('couldnt', { name: peerFirst })}{session.peer_note ? `: “${session.peer_note}”` : ''}{t('askAgain')}</span>
        )}
        {stage === 'requested' && <span className="text-xs text-amber">{t('asked', { name: peerFirst })}{session?.proposed_at ? t('askedFor', { time: fmt(session.proposed_at) }) : ''}{t('waitingReply')}</span>}
        {(stage === 'booked' || stage === 'reflect') && session?.scheduled_at && (
          <span className="text-xs text-primary">
            {t('booked', { name: peerFirst, time: fmt(session.scheduled_at) })}{session.peer_note ? ` · “${session.peer_note}”` : ''}
          </span>
        )}

        {/* controls (owner only) */}
        {canAct && !form && (
          <span className="flex flex-wrap gap-2">
            {stage === 'open' && <Button type="button" size="sm" variant="outline" className="min-h-9" disabled={pending} onClick={() => setForm('done')}>{t('markDone')}</Button>}
            {stage === 'done' && !a.peer_user_id && (
              <Button type="button" size="sm" variant="ghost" className="min-h-9" disabled={pending} onClick={() => run(() => setActionStatus(a.id, 'open'), t('movedOpen'))}>{t('undo')}</Button>
            )}
            {stage === 'ask' && <Button type="button" size="sm" className="min-h-9" disabled={pending} onClick={() => setForm('ask')}>{t('ask', { name: peerFirst })}</Button>}
            {stage === 'reflect' && <Button type="button" size="sm" className="min-h-9" disabled={pending} onClick={() => setForm('reflect')}>{t('recordNoticed')}</Button>}
            {(stage === 'requested' || stage === 'booked' || stage === 'reflect') && session && (
              <Button type="button" size="sm" variant="ghost" className="min-h-9" disabled={pending} onClick={() => run(() => cancelPeerObservation(session.id), t('cancelled'))}>{tc('cancel')}</Button>
            )}
            {pending && <Loader2 className="size-4 animate-spin self-center" aria-label={t('saving')} />}
          </span>
        )}

        {form === 'done' && (
          <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); run(() => setActionStatus(a.id, 'done', note.trim() || undefined), t('markedDone')); }}>
            <Label htmlFor={`note-${a.id}`} className="text-xs">{t('howWent')} <span className="font-normal text-muted-foreground">{tc('optional')}</span></Label>
            <Input id={`note-${a.id}`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className="min-h-10" placeholder={t('oneLine')} />
            <FormButtons pending={pending} label={t('markDone')} onCancel={() => setForm(null)} />
          </form>
        )}

        {form === 'ask' && (
          <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); run(() => requestPeerObservation(a.id, toIso(when), note.trim() || undefined), t('requestSent', { name: peerFirst })); }}>
            <p className="text-xs text-muted-foreground">{t('askHint', { name: peerFirst })}</p>
            <Label htmlFor={`when-${a.id}`} className="text-xs">{t('suggestTime')} <span className="font-normal text-muted-foreground">{tc('optional')}</span></Label>
            <Input id={`when-${a.id}`} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="min-h-10" />
            <Label htmlFor={`msg-${a.id}`} className="text-xs">{t('message')} <span className="font-normal text-muted-foreground">{tc('optional')}</span></Label>
            <Input id={`msg-${a.id}`} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className="min-h-10" placeholder={t('messagePlaceholder')} />
            <FormButtons pending={pending} label={t('ask', { name: peerFirst })} onCancel={() => setForm(null)} />
          </form>
        )}

        {form === 'reflect' && session && (
          <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); run(() => completePeerObservation(session.id, noticed, willTry), t('recorded')); }}>
            <Label htmlFor={`noticed-${a.id}`} className="text-xs">{t('whatNoticed', { name: peerFirst })}</Label>
            <Textarea id={`noticed-${a.id}`} value={noticed} maxLength={1000} onChange={(e) => setNoticed(e.target.value)} className="min-h-20" required minLength={10}
              placeholder={t('noticedPlaceholder')} />
            <Label htmlFor={`try-${a.id}`} className="text-xs">{t('oneThing')}</Label>
            <Input id={`try-${a.id}`} value={willTry} maxLength={500} onChange={(e) => setWillTry(e.target.value)} className="min-h-10" required minLength={3}
              placeholder={t('tryPlaceholder')} />
            <FormButtons pending={pending} label={t('saveComplete')} onCancel={() => setForm(null)} />
          </form>
        )}
      </div>
    </li>
  );
}

function FormButtons({ pending, label, onCancel }: { pending: boolean; label: string; onCancel: () => void }) {
  const tc = useTranslations('common');
  return (
    <span className="flex gap-2">
      <Button type="submit" size="sm" className="min-h-9" disabled={pending}>{pending && <Loader2 className="animate-spin" aria-hidden />} {label}</Button>
      <Button type="button" size="sm" variant="ghost" className="min-h-9" onClick={onCancel}>{tc('cancel')}</Button>
    </span>
  );
}
