'use client';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { DOMAIN_CLASSES, domainOf, isPossible } from '@/lib/levels';

type Props = {
  code: string;
  name: string;
  level?: number | null;
  valence?: 'glow' | 'grow';
  /** 0–1. Omit for leader-added tags. */
  confidence?: number | null;
  className?: string;
};

/**
 * Indicator tag: domain colour + code + name + level + confidence (PRD §9).
 * Plain words: every framework code is shown with its name.
 * Colour is never the only signal — the domain is also written out for screen readers.
 */
export function IndicatorTag({ code, name, level, valence, confidence, className }: Props) {
  const t = useTranslations();
  const domain = domainOf(code);
  const possible = confidence != null && isPossible(confidence);
  return (
    <span
      data-domain={domain}
      data-possible={possible}
      className={cn(
        'inline-flex max-w-full flex-wrap items-baseline gap-x-1.5 gap-y-0.5 rounded-2xl px-3 py-1 text-sm leading-snug',
        DOMAIN_CLASSES[domain],
        possible && 'border border-dashed border-current',
        className,
      )}
    >
      <span className="sr-only">{t(`tag.domain.${domain}`)}: </span>
      <span className="font-semibold tabular-nums">{code}</span>
      <span className="min-w-0 break-words">{name}</span>
      {level != null && <span className="font-semibold">· {t('level.short', { level })}</span>}
      {valence && <span className="sr-only">({t(`feedback.${valence}`)})</span>}
      {confidence != null &&
        (possible ? (
          <span className="italic">· {t('tag.possible')}</span>
        ) : (
          <span className="text-xs">· {t('tag.confidence', { pct: Math.round(confidence * 100) })}</span>
        ))}
    </span>
  );
}
