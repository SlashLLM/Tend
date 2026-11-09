'use client';
import { useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { setLnaAgreement } from '@/app/actions/lna';

const OPTIONS = [
  { v: 'yes', label: 'Yes' },
  { v: 'partly', label: 'Partly' },
  { v: 'no', label: 'Not really' },
] as const;

/** "This reflects my growth areas" — feeds the ≥85% LNA KPI (PRD M2.5). */
export function Agreement({ attemptId, initial }: { attemptId: string; initial: 'yes' | 'partly' | 'no' | null }) {
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <fieldset className="tend-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <legend className="sr-only">Does this reflect your growth areas?</legend>
      <p className="font-medium" aria-hidden>Does this reflect your growth areas?</p>
      <div role="radiogroup" aria-label="Does this reflect your growth areas?" className="flex gap-2">
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
            {o.label}
          </button>
        ))}
      </div>
      {value && <p role="status" className="text-sm text-muted-foreground">Thank you — noted.</p>}
    </fieldset>
  );
}
