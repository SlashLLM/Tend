'use client';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('programmes');
  const tw = useTranslations('workspace');
  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
      } catch (err) {
        console.error(err);
        toast.error(tw('error'));
      }
    });

  return (
    <div className="flex flex-wrap gap-2 lg:justify-end">
      {pending && <Loader2 className="size-4 animate-spin self-center" aria-label={t('saving')} />}
      {status === 'pending_review' && canApprove && (
        <Button type="button" size="sm" className="min-h-11" disabled={pending} onClick={() => run(() => approveCourse(id), t('approvedOk'))}>
          {t('approve')}
        </Button>
      )}
      {status !== 'retired' && (
        <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={pending} onClick={() => setOpen(true)}>
          {status === 'active' ? t('editSkills') : t('chooseSkills')}
        </Button>
      )}
      {status !== 'retired' ? (
        <Button type="button" size="sm" variant="ghost" className="min-h-11" disabled={pending} onClick={() => run(() => retireCourse(id), t('retiredOk'))}>
          {status === 'pending_review' ? t('reject') : t('retire')}
        </Button>
      ) : (
        <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={pending} onClick={() => run(() => restoreCourse(id), t('restoredOk'))}>
          {t('restore')}
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
            run(() => setCourseTags(id, v), t('savedOk'));
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
  const t = useTranslations('programmes');
  const tc = useTranslations('common');
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? indicators.filter((i) => i.code.startsWith(s) || i.name.toLowerCase().includes(s)) : indicators;
  }, [q, indicators]);
  const toggle = (c: string) => setCodes((xs) => (xs.includes(c) ? xs.filter((x) => x !== c) : xs.length >= MAX ? xs : [...xs, c]));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('dialogTitle')}</DialogTitle>
          <DialogDescription>{t('dialogDesc', { title, max: MAX })}</DialogDescription>
        </DialogHeader>
        <Input placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} className="min-h-11" aria-label={t('searchLabel')} />
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
          <span className="text-muted-foreground">{t('suitsLevels')}</span>
          <select aria-label={t('lowest')} value={levelMin} onChange={(e) => setMin(Number(e.target.value))} className="min-h-11 rounded-md border bg-card px-2">
            {[1, 2, 3].map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <span>{t('to')}</span>
          <select aria-label={t('highest')} value={levelMax} onChange={(e) => setMax(Number(e.target.value))} className="min-h-11 rounded-md border bg-card px-2">
            {[1, 2, 3].map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" className="min-h-11" onClick={onClose}>{tc('cancel')}</Button>
          <Button type="button" className="min-h-11" disabled={codes.length === 0} onClick={() => onSave({ indicatorCodes: codes, levelMin: Math.min(levelMin, levelMax), levelMax: Math.max(levelMin, levelMax) })}>
            {t('savePublish')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
