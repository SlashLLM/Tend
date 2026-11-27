'use client';
import { Eye, Loader2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { listCoachThreads, openCoachThread, type CoachThreadMeta } from '@/app/actions/coach';
import { cn } from '@/lib/utils';

type Msg = { role: 'user' | 'assistant'; content: string; created_at: string };

/**
 * Detail behind the digest (PRD M5.7, Q5 "digest first, logged drill-down"). Two deliberate
 * steps: list conversations (dates only), then open one after a confirmation that says the
 * educator will see it in "Who accessed your records".
 */
export function CoachDetails({ educatorId, educatorFirstName }: { educatorId: string; educatorFirstName: string }) {
  const t = useTranslations('digest');
  const format = useFormatter();
  const [threads, setThreads] = useState<CoachThreadMeta[] | null>(null);
  const [confirm, setConfirm] = useState<CoachThreadMeta | null>(null);
  const [open, setOpen] = useState<{ id: string; messages: Msg[] } | null>(null);
  const [pending, start] = useTransition();

  const load = () =>
    start(async () => {
      try {
        setThreads(await listCoachThreads(educatorId));
      } catch {
        toast.error(t('detailFailed'));
      }
    });

  const read = (th: CoachThreadMeta) =>
    start(async () => {
      try {
        setOpen({ id: th.id, messages: await openCoachThread(th.id) });
        setConfirm(null);
      } catch {
        toast.error(t('detailFailed'));
      }
    });

  const when = (iso: string) => format.dateTime(new Date(iso), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  if (!threads)
    return (
      <Button variant="outline" size="sm" className="mt-3 min-h-11" disabled={pending} onClick={load}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Eye aria-hidden />} {t('details')}
      </Button>
    );

  return (
    <div className="mt-4 grid gap-3 border-t pt-4">
      <p className="text-xs text-muted-foreground">{t('detailsLogged', { name: educatorFirstName })}</p>
      {threads.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noThreads')}</p>
      ) : (
        <ul className="grid gap-2">
          {threads.map((th) => (
            <li key={th.id} className="grid gap-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span><span className="tabular-nums">{when(th.created_at)}</span> · <span className="text-muted-foreground">{t('messages', { n: th.messages })}</span></span>
                {open?.id !== th.id && (
                  <Button size="sm" variant="ghost" className="min-h-11" disabled={pending} onClick={() => setConfirm(th)}>{t('open')}</Button>
                )}
              </div>
              {open?.id === th.id && (
                <ol className="grid gap-2 rounded-lg bg-muted p-3 text-sm" aria-label={t('conversationOf', { date: when(th.created_at) })}>
                  {open.messages.map((m, i) => (
                    <li key={i} className={cn('grid gap-0.5', m.role === 'assistant' && 'text-muted-foreground')}>
                      <span className="text-xs font-medium">{m.role === 'user' ? educatorFirstName : t('coach')}</span>
                      <span className="whitespace-pre-wrap">{m.content}</span>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmTitle')}</DialogTitle>
            <DialogDescription>{t('confirmBody', { name: educatorFirstName })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" className="min-h-11" onClick={() => setConfirm(null)}>{t('cancel')}</Button>
            <Button className="min-h-11" disabled={pending} onClick={() => confirm && read(confirm)}>
              {pending && <Loader2 className="animate-spin" aria-hidden />} {t('confirmOpen')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
