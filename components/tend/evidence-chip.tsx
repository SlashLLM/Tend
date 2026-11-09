'use client';
import { Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { formatMs, spokenMs } from '@/lib/levels';

type Props = { ms: number; onSeek?: (ms: number) => void; className?: string };

/** Evidence chip (▶ 10:04). Tapping replays the exact moment the sentence is based on. */
export function EvidenceChip({ ms, onSeek, className }: Props) {
  const t = useTranslations('evidence');
  return (
    <button
      type="button"
      onClick={() => onSeek?.(ms)}
      aria-label={t('play', { time: spokenMs(ms) })}
      className={cn(
        'inline-flex min-h-11 items-center gap-1 rounded-full bg-secondary px-3 text-sm font-medium tabular-nums text-secondary-foreground',
        'hover:bg-primary hover:text-primary-foreground transition-colors duration-150',
        className,
      )}
    >
      <Play aria-hidden className="size-3.5 fill-current" />
      {formatMs(ms)}
    </button>
  );
}
