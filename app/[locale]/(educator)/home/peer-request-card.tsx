'use client';
import { Loader2, Users } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { respondPeerObservation } from '@/app/actions/peer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** ISO → value for <input type="datetime-local"> in the browser's time zone. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export type IncomingPeerRequest = {
  id: string;
  observerName: string;
  indicator: string;
  proposedAt: string | null;
  note: string | null;
};

/** A colleague asks to watch you for 15 minutes: accept with a time, or decline (no reason needed). */
export function PeerRequestCard({ req }: { req: IncomingPeerRequest }) {
  const [pending, start] = useTransition();
  const t = useTranslations('peerRequest');
  const tc = useTranslations('common');
  const format = useFormatter();
  const fmt = (iso: string) => format.dateTime(new Date(iso), { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const [when, setWhen] = useState(toLocalInput(req.proposedAt));
  const [reply, setReply] = useState('');
  const first = req.observerName.split(' ')[0];

  const answer = (accept: boolean) =>
    start(async () => {
      try {
        await respondPeerObservation(req.id, accept, accept && when ? new Date(when).toISOString() : null, reply.trim() || undefined);
        toast.success(accept ? t('booked', { name: first }) : t('declined', { name: first }));
      } catch (e) {
        console.error(e);
        toast.error(t('replyFailed'));
      }
    });

  return (
    <section className="tend-card grid gap-3 border-l-4 border-l-amber p-5" aria-label={t('ariaFrom', { name: req.observerName })}>
      <p className="tend-dateline flex items-center gap-1.5 text-amber"><Users className="size-3.5" aria-hidden /> {t('label')}</p>
      <h2 className="text-lg font-semibold">{t('title', { name: first })}</h2>
      <p className="text-sm text-muted-foreground">
        {t.rich('workingOn', { indicator: req.indicator, b: (c) => <span className="font-medium text-foreground">{c}</span> })}{' '}
        {req.proposedAt ? t('suggested', { time: fmt(req.proposedAt) }) : t('chooseTime')}
      </p>
      {req.note && <p className="rounded-lg bg-muted/60 p-3 text-sm">“{req.note}”</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`pr-when-${req.id}`}>{t('time')}</Label>
          <Input id={`pr-when-${req.id}`} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="min-h-11" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`pr-msg-${req.id}`}>{t('reply')} <span className="font-normal text-muted-foreground">{tc('optional')}</span></Label>
          <Input id={`pr-msg-${req.id}`} value={reply} maxLength={300} onChange={(e) => setReply(e.target.value)} className="min-h-11" placeholder={t('replyPlaceholder')} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11" disabled={pending || !when} onClick={() => answer(true)}>{pending && <Loader2 className="animate-spin" aria-hidden />} {t('accept')}</Button>
        <Button variant="ghost" className="min-h-11" disabled={pending} onClick={() => answer(false)}>{t('notThisTime')}</Button>
      </div>
    </section>
  );
}
