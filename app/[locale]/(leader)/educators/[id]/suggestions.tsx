'use client';
import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { decideSuggestion } from '@/app/actions/idp';

type Item = { id: string; kind: string; code: string; name: string; from: number; to: number | null; level: number | null };

/** Suggested IDP updates — the leader accepts or declines; nothing changes automatically (PRD M3.5). */
export function Suggestions({ items }: { items: Item[] }) {
  const [pending, start] = useTransition();
  const t = useTranslations('suggestion');
  const tw = useTranslations('workspace');
  const decide = (id: string, accept: boolean) =>
    start(async () => {
      try {
        await decideSuggestion(id, accept);
        toast.success(accept ? t('accepted') : t('declined'));
      } catch (e) {
        console.error(e);
        toast.error(tw('error'));
      }
    });
  return (
    <ul className="grid gap-2">
      {items.map((s) => (
        <li key={s.id} className="tend-card flex flex-col gap-3 border-l-4 border-l-amber p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            <span className="font-medium">{s.code} {s.name}</span>
            <br />
            {s.kind === 'raise_target'
              ? t('raise', { level: s.level ?? '—', from: s.from, to: s.to ?? '—' })
              : t('update', { level: s.level ?? '—' })}
          </p>
          <span className="flex gap-2">
            <Button size="sm" className="min-h-11" disabled={pending} onClick={() => decide(s.id, true)}><Check aria-hidden /> {t('accept')}</Button>
            <Button size="sm" variant="outline" className="min-h-11" disabled={pending} onClick={() => decide(s.id, false)}><X aria-hidden /> {t('decline')}</Button>
          </span>
        </li>
      ))}
    </ul>
  );
}
