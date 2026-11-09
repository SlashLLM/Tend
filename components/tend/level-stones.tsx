'use client';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { isLevel, levelPhrase, type Level } from '@/lib/levels';

type Props = {
  /** Most recent observed level (null = not yet observed). */
  level: number | null | undefined;
  /** Optional IDP target level, shown with a ring. */
  target?: number | null;
  /** Interactive self-rating picker (LNA). */
  onSelect?: (level: Level) => void;
  size?: 'sm' | 'md';
  className?: string;
};

/**
 * Three stepping stones labelled L1, L2, L3. Never a progress bar, never a score (PRD §9).
 */
export function LevelStones({ level, target, onSelect, size = 'md', className }: Props) {
  const t = useTranslations('level');
  const phrase = levelPhrase(level);
  const label = t(phrase.key, phrase.values);
  const stones: Level[] = [1, 2, 3];
  const dim = size === 'sm' ? 'size-7 text-[0.7rem]' : 'size-10 text-sm';

  if (onSelect) {
    return (
      <div role="radiogroup" aria-label={t('stones')} className={cn('flex items-end gap-2', className)}>
        {stones.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={level === n}
            aria-label={`${t('name', { level: n })}: ${t(`descriptions.${n}`)}`}
            onClick={() => onSelect(n)}
            className={cn(
              'rounded-full border-2 px-3 font-semibold transition-colors duration-200',
              'h-11 min-w-11', // 44px touch target
              level === n ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:border-primary',
            )}
          >
            {t('short', { level: n })}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div role="img" aria-label={label} className="flex items-center" data-testid="level-stones">
        {stones.map((n, i) => {
          const reached = isLevel(level) && n <= level;
          const isTarget = target === n;
          return (
            <span key={n} aria-hidden className="flex items-center">
              {i > 0 && (
                <span className={cn('h-0.5', size === 'sm' ? 'w-2' : 'w-4', isLevel(level) && n <= level ? 'bg-primary' : 'bg-border')} />
              )}
              <span
                data-reached={reached}
                data-target={isTarget}
                className={cn(
                  'inline-flex items-center justify-center rounded-full border-2 font-semibold tabular-nums',
                  dim,
                  reached ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground',
                  isTarget && !reached && 'border-dashed border-amber text-amber',
                )}
              >
                {t('short', { level: n })}
              </span>
            </span>
          );
        })}
      </div>
      {size === 'md' && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  );
}
