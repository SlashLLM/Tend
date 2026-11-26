'use client';
import { Loader2 } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { approveCourse, restoreCourse, retireCourse, setCourseTags } from '@/app/actions/catalogue';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type Props = {
  id: string;
  title: string;
  status: 'active' | 'pending_review' | 'retired';
  canApprove: boolean;
  current: { codes: string[]; levelMin: number; levelMax: number };
  indicators: { code: string; name: string }[];
};

const MAX = 4;

export function CourseActions({ id, title, status, canApprove, current, indicators }: Props) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong');
      }
    });

  return (
    <div className="flex flex-wrap gap-2 lg:justify-end">
      {pending && <Loader2 className="size-4 animate-spin self-center" aria-label="Saving" />}
      {status === 'pending_review' && canApprove && (
        <Button type="button" size="sm" className="min-h-11" disabled={pending} onClick={() => run(() => approveCourse(id), 'Approved: now recommended in Learn')}>
          Approve
        </Button>
      )}
      {status !== 'retired' && (
        <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={pending} onClick={() => setOpen(true)}>
          {status === 'active' ? 'Edit skills' : 'Choose skills'}
        </Button>
      )}
      {status !== 'retired' ? (
        <Button type="button" size="sm" variant="ghost" className="min-h-11" disabled={pending} onClick={() => run(() => retireCourse(id), 'Retired: hidden from educators')}>
          {status === 'pending_review' ? 'Reject' : 'Retire'}
        </Button>
      ) : (
        <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={pending} onClick={() => run(() => restoreCourse(id), 'Moved back to review')}>
          Restore for review
        </Button>
      )}
      {open && (
        <TagDialog
          title={title}
          initial={current}
          indicators={indicators}
          onClose={() => setOpen(false)}
          onSave={(v) => {
            setOpen(false);
            run(() => setCourseTags(id, v), 'Saved: now recommended in Learn');
          }}
        />
      )}
    </div>
  );
}

function TagDialog({
  title, initial, indicators, onClose, onSave,
}: {
  title: string;
  initial: Props['current'];
  indicators: Props['indicators'];
  onClose: () => void;
  onSave: (v: { indicatorCodes: string[]; levelMin: number; levelMax: number }) => void;
}) {
  const [codes, setCodes] = useState<string[]>(initial.codes.slice(0, MAX));
  const [levelMin, setMin] = useState(initial.levelMin);
  const [levelMax, setMax] = useState(initial.levelMax);
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? indicators.filter((i) => i.code.startsWith(s) || i.name.toLowerCase().includes(s)) : indicators;
  }, [q, indicators]);
  const toggle = (c: string) => setCodes((xs) => (xs.includes(c) ? xs.filter((x) => x !== c) : xs.length >= MAX ? xs : [...xs, c]));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Framework skills</DialogTitle>
          <DialogDescription>Which indicators does “{title}” build? Choose up to {MAX}.</DialogDescription>
        </DialogHeader>
        <Input placeholder="Search by code or name" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-11" aria-label="Search indicators" />
        <ul className="grid max-h-[45dvh] gap-1 overflow-y-auto pr-1">
          {shown.map((i) => (
            <li key={i.code}>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted">
                <input type="checkbox" className="mt-1 size-4" checked={codes.includes(i.code)} disabled={!codes.includes(i.code) && codes.length >= MAX} onChange={() => toggle(i.code)} />
                <span><span className="font-medium tabular-nums">{i.code}</span> {i.name}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">Suits levels</span>
          <select aria-label="Lowest level" value={levelMin} onChange={(e) => setMin(Number(e.target.value))} className="min-h-11 rounded-md border bg-card px-2">
            {[1, 2, 3].map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <span>to</span>
          <select aria-label="Highest level" value={levelMax} onChange={(e) => setMax(Number(e.target.value))} className="min-h-11 rounded-md border bg-card px-2">
            {[1, 2, 3].map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" className="min-h-11" onClick={onClose}>Cancel</Button>
          <Button type="button" className="min-h-11" disabled={codes.length === 0} onClick={() => onSave({ indicatorCodes: codes, levelMin: Math.min(levelMin, levelMax), levelMax: Math.max(levelMin, levelMax) })}>
            Save and publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
