'use client';
import { BookmarkPlus, Eye, Loader2, Send } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { saveReflection } from '@/app/actions/coach';

type Msg = { role: 'user' | 'assistant'; content: string; citations: { label: string }[] };

const SUGGESTED = ['s1', 's2', 's3'] as const;

export function CoachChat({ initialThread, initial, goalId, goalLabel }: { initialThread: string | null; initial: Msg[]; goalId: string | null; goalLabel: string | null }) {
  const t = useTranslations('coach');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [thread, setThread] = useState(initialThread);
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [text, setText] = useState(goalLabel ? t('goalPrefill', { goal: goalLabel }) : '');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  async function send(message: string) {
    const m = message.trim();
    if (!m || busy) return;
    setMsgs((x) => [...x, { role: 'user', content: m, citations: [] }]);
    setText('');
    setBusy(true);
    try {
      const res = await fetch('/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ threadId: thread, message: m, goalId, locale }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Coach is unavailable');
      setThread(body.threadId);
      setMsgs((x) => [...x, { role: 'assistant', content: body.reply, citations: body.citations ?? [] }]);
    } catch (e) {
      console.error(e);
      toast.error(t('unavailable'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <p className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm" role="note">
        <Eye className="size-4 shrink-0 text-primary" aria-hidden /> {t('privacy')}
      </p>
      <section aria-label={t('conversation')} aria-live="polite" className="tend-card grid min-h-72 content-start gap-3 p-4">
        {msgs.length === 0 && (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">{t('tryThese')}</p>
            {SUGGESTED.map((s) => (
              <button key={s} onClick={() => void send(t(s))} className="min-h-11 rounded-xl border px-3 text-left text-sm hover:border-primary">{t(s)}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn('grid max-w-[85%] gap-1.5 rounded-2xl px-4 py-2.5 text-sm leading-relaxed', m.role === 'user' ? 'justify-self-end bg-primary text-primary-foreground' : 'justify-self-start bg-muted')}>
            <p>{m.content}</p>
            {m.role === 'assistant' && (
              <div className="flex flex-wrap items-center gap-1.5">
                {m.citations.map((c, k) => <span key={k} className="rounded-full bg-card px-2 py-0.5 text-xs">{c.label === 'card' ? t('citeCard') : c.label === 'notes' ? t('citeNotes') : t('citeGoal', { code: c.label })}</span>)}
                <button className="ml-auto inline-flex min-h-9 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={async () => { await saveReflection(t('ideaPrefix', { text: m.content }), 'private'); toast.success(t('savedJournal')); }}>
                  <BookmarkPlus className="size-3.5" aria-hidden /> {t('saveAsReflection')}
                </button>
              </div>
            )}
          </div>
        ))}
        {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> {t('thinking')}</p>}
        <div ref={end} />
      </section>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <Textarea aria-label={t('messageLabel')} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('placeholder')} className="min-h-12"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(text); } }} />
        <Button type="submit" size="icon" className="size-12 shrink-0" disabled={busy || !text.trim()} aria-label={tc('send')}><Send aria-hidden /></Button>
      </form>
    </div>
  );
}
