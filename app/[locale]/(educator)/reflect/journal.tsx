'use client';
import { Loader2, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { deleteReflection, saveReflection } from '@/app/actions/coach';

export function JournalForm() {
  const [text, setText] = useState('');
  const [shared, setShared] = useState(false);
  const [pending, start] = useTransition();
  return (
    <form
      className="tend-card grid gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            await saveReflection(text, shared ? 'shared' : 'private');
            setText('');
            toast.success(shared ? 'Saved and shared with your leader' : 'Saved privately');
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not save');
          }
        });
      }}
    >
      <Textarea aria-label="New reflection" value={text} onChange={(e) => setText(e.target.value)} placeholder="What did you notice today?" className="min-h-24" maxLength={4000} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <Switch checked={shared} onCheckedChange={setShared} aria-label="Share with my Centre Leader" />
          Share with my Centre Leader
        </label>
        <Button type="submit" className="min-h-11" disabled={pending || !text.trim()}>{pending && <Loader2 className="animate-spin" aria-hidden />} Save</Button>
      </div>
    </form>
  );
}

export function DeleteEntry({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="icon" className="size-9" aria-label="Delete reflection" disabled={pending}
      onClick={() => start(async () => { await deleteReflection(id); toast('Deleted'); })}>
      <Trash2 className="size-4" aria-hidden />
    </Button>
  );
}
