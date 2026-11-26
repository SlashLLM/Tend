'use client';
import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/** Shown once after an invite or reset. The password is not stored anywhere the admin can see it again. */
export function TempPassword({ who, password, onDone }: { who: string; password: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const t = useTranslations('admin');
  return (
    <div role="status" className="grid min-w-64 gap-2 rounded-lg text-left border border-primary/40 bg-primary/5 p-4 text-sm">
      <p>{t.rich('tempFor', { who, b: (c) => <span className="font-medium">{c}</span> })}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code aria-label={t('tempLabel')} className="whitespace-nowrap rounded bg-card px-2 py-1 font-mono text-base tracking-wide select-all">{password}</code>
        <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={async () => {
          try {
            await navigator.clipboard.writeText(password);
            setCopied(true);
          } catch { /* clipboard blocked: the password is still on screen */ }
        }}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? t('copied') : t('copy')}
        </Button>
      </div>
      <p className="text-muted-foreground">{t('notShownAgain')}</p>
      <Button type="button" variant="ghost" size="sm" className="min-h-11 justify-self-start" onClick={onDone}>{t('done')}</Button>
    </div>
  );
}
