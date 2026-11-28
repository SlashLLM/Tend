'use client';
import { CalendarPlus, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Letter, LetterTitle } from '@/components/home/letter';
import { requestObservation, resolveObservationRequest } from '@/app/actions/observation';

const MAX = 300;

/**
 * Educator-initiated: ask your centre leader to observe. The leader still picks the time.
 * On Home it is the one letter you write yourself; once sent it waits in the letterbox until answered.
 */
export function RequestObservation({ open, index = 0 }: { open: { id: string; note: string | null; created_at?: string | null } | null; index?: number }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState('');
  const t = useTranslations('requestObs');
  const tc = useTranslations('common');
  const th = useTranslations('home');

  if (open) {
    return (
      <Letter as="section" sender={{ kind: 'you' }} kind={th('toLeader')} at={open.created_at ?? null} index={index} aria-label={t('requestedAria')}>
        <LetterTitle>{t('leaderHas')}</LetterTitle>
        <p className="max-w-prose text-muted-foreground">
          {open.note ? t('youSaid', { note: open.note }) : null}{t('notify')}
        </p>
        <div className="mt-1">
          <Button
            variant="outline" className="min-h-11" disabled={pending}
            onClick={() => start(async () => {
              try {
                await resolveObservationRequest(open.id, 'withdraw');
                toast.success(t('withdrawn'));
              } catch (err) {
                console.error(err);
                toast.error(t('withdrawFailed'));
              }
            })}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />} {t('withdraw')}
          </Button>
        </div>
      </Letter>
    );
  }

  return (
    <Letter
      as="form"
      sender={{ kind: 'you' }}
      kind={th('toLeader')}
      index={index}
      aria-label={t('formAria')}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            await requestObservation(note);
            setNote('');
            toast.success(t('sent'));
          } catch (err) {
            console.error(err);
            toast.error(t('sendFailed'));
          }
        });
      }}
    >
      <LetterTitle>{t('ask')}</LetterTitle>
      <div className="grid gap-1.5">
        <Label htmlFor="request-note">{t('noteLabel')} <span className="whitespace-nowrap font-normal text-muted-foreground">{tc('optional')}</span></Label>
        <Textarea id="request-note" value={note} maxLength={MAX} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')} className="min-h-20 bg-card" />
        <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">{note.length}/{MAX}</p>
      </div>
      <div>
        <Button type="submit" className="min-h-11" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CalendarPlus aria-hidden />} {t('submit')}
        </Button>
      </div>
    </Letter>
  );
}
