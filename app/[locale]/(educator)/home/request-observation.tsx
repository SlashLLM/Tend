'use client';
import { CalendarPlus, Hourglass, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('requestObs');
  const tc = useTranslations('common');

  if (open) {
    return (
      <section className="tend-card grid gap-3 p-5" aria-label={t('requestedAria')}>
        <p className="tend-dateline flex items-center gap-1.5 text-amber"><Hourglass className="size-3.5" aria-hidden /> {t('requested')}</p>
        <h2 className="text-lg font-semibold">{t('leaderHas')}</h2>
        <p className="text-sm text-muted-foreground">
          {open.note ? t('youSaid', { note: open.note }) : null}{t('notify')}
        </p>
        <div>
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
      </section>
    );
  }

  return (
    <form
      className="tend-card grid gap-3 p-5"
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
      <p className="tend-dateline flex items-center gap-1.5"><CalendarPlus className="size-3.5" aria-hidden /> {t('ready')}</p>
      <h2 className="text-lg font-semibold">{t('ask')}</h2>
      <div className="grid gap-1.5">
        <Label htmlFor="request-note">{t('noteLabel')} <span className="font-normal text-muted-foreground">{tc('optional')}</span></Label>
        <Textarea id="request-note" value={note} maxLength={MAX} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')} className="min-h-20" />
        <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">{note.length}/{MAX}</p>
      </div>
      <div>
        <Button type="submit" className="min-h-11" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CalendarPlus aria-hidden />} {t('submit')}
        </Button>
      </div>
    </form>
  );
}
