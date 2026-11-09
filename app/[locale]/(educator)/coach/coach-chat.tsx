'use client';
import { BookmarkPlus, Eye, Loader2, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { saveReflection } from '@/app/actions/coach';

type Msg = { role: 'user' | 'assistant'; content: string; citations: { label: string }[] };

const SUGGESTED = [
  'My K1s go quiet when I ask open questions',
  'How can I help children wait for their turn?',
  'Give me one idea for tomorrow’s story time',
];

export function CoachChat({ initialThread, initial, goalId, goalLabel }: { initialThread: string | null; initial: Msg[]; goalId: string | null; goalLabel: string | null }) {
  const [thread, setThread] = useState(initialThread);
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [text, setText] = useState(goalLabel ? `Ideas for my goal ${goalLabel}?` : '');
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
      const res = await fetch('/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ threadId: thread, message: m, goalId }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Coach is unavailable');
      setThread(body.threadId);
      setMsgs((x) => [...x, { role: 'assistant', content: body.reply, citations: body.citations ?? [] }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Coach is unavailable');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <p className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm" role="note">
        <Eye className="size-4 shrink-0 text-primary" aria-hidden /> Your Centre Leader can see themes from your chats — never your private reflections.
      </p>
      <section aria-label="Conversation" aria-live="polite" className="tend-card grid min-h-72 content-start gap-3 p-4">
        {msgs.length === 0 && (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">Try one of these:</p>
            {SUGGESTED.map((s) => (
              <button key={s} onClick={() => void send(s)} className="min-h-11 rounded-xl border px-3 text-left text-sm hover:border-primary">{s}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn('grid max-w-[85%] gap-1.5 rounded-2xl px-4 py-2.5 text-sm leading-relaxed', m.role === 'user' ? 'justify-self-end bg-primary text-primary-foreground' : 'justify-self-start bg-muted')}>
            <p>{m.content}</p>
            {m.role === 'assistant' && (
              <div className="flex flex-wrap items-center gap-1.5">
                {m.citations.map((c, k) => <span key={k} className="rounded-full bg-card px-2 py-0.5 text-xs">{c.label === 'card' ? 'your card' : c.label === 'notes' ? 'your notes' : `goal ${c.label}`}</span>)}
                <button className="ml-auto inline-flex min-h-9 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={async () => { await saveReflection(`Coach idea: ${m.content}`, 'private'); toast.success('Saved to your private journal'); }}>
                  <BookmarkPlus className="size-3.5" aria-hidden /> Save as reflection
                </button>
              </div>
            )}
          </div>
        ))}
        {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> Thinking…</p>}
        <div ref={end} />
      </section>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <Textarea aria-label="Message to Coach" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask Coach… (your keyboard’s mic works too)" className="min-h-12"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(text); } }} />
        <Button type="submit" size="icon" className="size-12 shrink-0" disabled={busy || !text.trim()} aria-label="Send"><Send aria-hidden /></Button>
      </form>
    </div>
  );
}
