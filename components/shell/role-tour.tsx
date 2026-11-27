'use client';
import { ArrowLeft, ArrowRight, Compass, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { saveTourProgress } from '@/app/actions/tour';
import { usePathname } from '@/i18n/navigation';
import { HOME, type Area } from '@/lib/auth/roles';
import { LOCALE_PREFIX_RE } from '@/i18n/routing';
import { TOURS } from '@/lib/tours';

/** Event other parts of the shell dispatch to (re)start the tour ("Take the tour"). */
export const TOUR_EVENT = 'tend:tour';
export function launchTour() {
  window.dispatchEvent(new Event(TOUR_EVENT));
}

/** The visible nav element for a step: the rail link on desktop, the bottom-bar link (or "More") on phones. */
function target(href: string): HTMLElement | null {
  const visible = (el: Element | null) => (el instanceof HTMLElement && el.getClientRects().length > 0 ? el : null);
  for (const el of document.querySelectorAll(`[data-tour="${href}"]`)) if (visible(el)) return el as HTMLElement;
  return visible(document.querySelector('[data-tour="more"]'));
}

/**
 * Role tour (PRD M1): ≤ 5 short steps, each highlighting a labelled main-nav item. Non-modal, so
 * the page stays usable; Esc or "Skip tour" closes it; progress is saved so it resumes.
 */
export function RoleTour({ area, autoStep }: { area: Area; autoStep: number | null }) {
  const t = useTranslations('tour');
  const steps = TOURS[area];
  const pathname = usePathname();
  const onHome = (pathname.replace(LOCALE_PREFIX_RE, '') || '/') === HOME[area];
  const [step, setStep] = useState<number | null>(autoStep !== null && onHome ? autoStep : null);
  const card = useRef<HTMLDivElement>(null);
  const lit = useRef<HTMLElement | null>(null);

  const save = useCallback((progress: number | 'done' | 'skipped') => {
    saveTourProgress({ area, progress }).catch(() => {}); // best effort: a lost save only re-shows the tour
  }, [area]);

  useEffect(() => {
    const open = () => setStep(0);
    window.addEventListener(TOUR_EVENT, open);
    return () => window.removeEventListener(TOUR_EVENT, open);
  }, []);

  // Highlight the current step's nav item and move focus to the card.
  useEffect(() => {
    lit.current?.removeAttribute('data-tour-active');
    lit.current = null;
    if (step === null) return;
    const el = target(steps[step].href);
    if (el) {
      el.setAttribute('data-tour-active', 'true');
      lit.current = el;
    }
    card.current?.focus();
    return () => lit.current?.removeAttribute('data-tour-active');
  }, [step, steps]);

  if (step === null) return null;
  const last = step === steps.length - 1;
  const go = (n: number) => {
    setStep(n);
    save(n);
  };
  const close = (how: 'done' | 'skipped') => {
    setStep(null);
    save(how);
  };

  return (
    <div
      ref={card}
      role="dialog"
      aria-modal="false"
      aria-labelledby="tour-title"
      aria-describedby="tour-body"
      tabIndex={-1}
      onKeyDown={(e) => e.key === 'Escape' && close('skipped')}
      className="tend-card fixed inset-x-4 bottom-20 z-50 grid gap-3 p-5 shadow-lg outline-none motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200 md:inset-x-auto md:bottom-6 md:left-64 md:w-96"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="tend-dateline flex items-center gap-1.5"><Compass className="size-3.5" aria-hidden /> {t('stepOf', { n: step + 1, total: steps.length })}</p>
        <button type="button" onClick={() => close('skipped')} className="-m-2 grid size-11 place-items-center rounded-md text-muted-foreground hover:text-foreground" aria-label={t('skip')}>
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <h2 id="tour-title" className="font-heading text-lg font-semibold">{t(`${area}.${steps[step].key}.title`)}</h2>
      <p id="tour-body" className="text-sm">{t(`${area}.${steps[step].key}.body`)}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {step > 0 ? (
          <Button variant="ghost" className="min-h-11" onClick={() => go(step - 1)}><ArrowLeft aria-hidden /> {t('back')}</Button>
        ) : (
          <Button variant="ghost" className="min-h-11" onClick={() => close('skipped')}>{t('skip')}</Button>
        )}
        <Button className="min-h-11" onClick={() => (last ? close('done') : go(step + 1))}>
          {last ? t('finish') : <>{t('next')} <ArrowRight aria-hidden /></>}
        </Button>
      </div>
    </div>
  );
}
