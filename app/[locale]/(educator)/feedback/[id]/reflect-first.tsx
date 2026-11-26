'use client';
import { Loader2, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { submitReflection } from '@/app/actions/feedback';

/** Reflect FIRST (PRD M4.16): the notes unlock only after the educator's own reflection. */
export function ReflectFirst({ obsId, reviewer }: { obsId: string; reviewer: string }) {
  const [text, setText] = useState('');
  const [pending, start] = useTransition();
  const t = useTranslations('reflectFirst');
  const tc = useTranslations('common');
  return (
    <section className="tend-card grid gap-4 p-6" aria-labelledby="reflect-h">
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="size-4" aria-hidden /> {t('ready', { name: reviewer })}</p>
      <h2 id="reflect-h" className="text-xl font-semibold">{t('title')}</h2>
      <p className="text-muted-foreground">{t('hint')}</p>
      <Textarea aria-label={t('label')} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('placeholder')} className="min-h-28" maxLength={2000} />
      <Button
        className="min-h-11 justify-self-start"
        disabled={pending || text.trim().length < 3}
        onClick={() =>
          start(async () => {
            try {
              await submitReflection(obsId, text);
            } catch (e) {
              console.error(e);
              toast.error(tc('couldNotSave'));
            }
          })
        }
      >
        {pending && <Loader2 className="animate-spin" aria-hidden />} {t('submit')}
      </Button>
    </section>
  );
}
