'use client';
import { Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { fromSgInput, sgDate, toSgInput } from '@/lib/format';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { respondPeerObservation } from '@/app/actions/peer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Letter, LetterTitle } from '@/components/home/letter';


export type IncomingPeerRequest = {
  id: string;
  observerName: string;
  indicator: string;
  proposedAt: string | null;
  note: string | null;
  /** When the request was sent (postmark). */
  sentAt: string | null;
};

/** A colleague asks to watch you for 15 minutes: accept with a time, or decline (no reason needed). */
export function PeerRequestCard({ req, index = 0 }: { req: IncomingPeerRequest; index?: number }) {
  const [pending, start] = useTransition();
  const t = useTranslations('peerRequest');
  const tc = useTranslations('common');
  const th = useTranslations('home');
  const locale = useLocale();
  const fmt = (iso: string) => sgDate(new Date(iso), locale, { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const [when, setWhen] = useState(toSgInput(req.proposedAt));
  const [reply, setReply] = useState('');
  const first = req.observerName.split(' ')[0];

  const answer = (accept: boolean) =>
    start(async () => {
      try {
        await respondPeerObservation(req.id, accept, accept && when ? fromSgInput(when) : null, reply.trim() || undefined);
        toast.success(accept ? t('booked', { name: first }) : t('declined', { name: first }));
      } catch (e) {
        console.error(e);
        toast.error(t('replyFailed'));
      }
    });

  return (
    <Letter as="section" sender={{ kind: 'person', name: req.observerName }} kind={th('kindPeer')} at={req.sentAt} unread index={index} aria-label={t('ariaFrom', { name: req.observerName })}>
      <LetterTitle>{t('title', { name: first })}</LetterTitle>
      <p className="max-w-prose text-muted-foreground">
        {t.rich('workingOn', { indicator: req.indicator, b: (c) => <span className="font-medium text-foreground">{c}</span> })}{' '}
        {req.proposedAt ? t('suggested', { time: fmt(req.proposedAt) }) : t('chooseTime')}
      </p>
      {req.note && <blockquote className="max-w-prose rounded-xl bg-muted/70 px-4 py-3 italic">“{req.note}”</blockquote>}
      <div className="mt-1 grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`pr-when-${req.id}`}>{t('time')}</Label>
          <Input id={`pr-when-${req.id}`} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="min-h-11" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`pr-msg-${req.id}`}>{t('reply')} <span className="font-normal text-muted-foreground">{tc('optional')}</span></Label>
          <Input id={`pr-msg-${req.id}`} value={reply} maxLength={300} onChange={(e) => setReply(e.target.value)} className="min-h-11" placeholder={t('replyPlaceholder')} />
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-2">
        <Button className="min-h-11" disabled={pending || !when} onClick={() => answer(true)}>{pending && <Loader2 className="animate-spin" aria-hidden />} {t('accept')}</Button>
        <Button variant="ghost" className="min-h-11" disabled={pending} onClick={() => answer(false)}>{t('notThisTime')}</Button>
      </div>
    </Letter>
  );
}
