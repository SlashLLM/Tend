'use client';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { setLnaAgreement } from '@/app/actions/lna';

const OPTIONS = [
  { v: 'yes', label: 'agreeYes' },
  { v: 'partly', label: 'agreePartly' },
  { v: 'no', label: 'agreeNo' },
] as const;

/** "This reflects my growth areas" — feeds the ≥85% LNA KPI (PRD M2.5). */
export function Agreement({ attemptId, initial }: { attemptId: string; initial: 'yes' | 'partly' | 'no' | null }) {
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const t = useTranslations('snapshot');
  return (
    <fieldset className="tend-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <legend className="sr-only">{t('agreeQuestion')}</legend>
      <p className="font-medium" aria-hidden>{t('agreeQuestion')}</p>
      <div role="radiogroup" aria-label={t('agreeQuestion')} className="flex gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={value === o.v}
            disabled={pending}
            onClick={() => start(async () => { setValue(o.v); await setLnaAgreement(attemptId, o.v); })}
            className={cn('min-h-11 rounded-full border px-4 text-sm font-medium', value === o.v ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary')}
          >
            {t(o.label)}
          </button>
        ))}
      </div>
      {value && <p role="status" className="text-sm text-muted-foreground">{t('thanks')}</p>}
    </fieldset>
  );
}
