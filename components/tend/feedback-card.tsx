'use client';
import { Footprints, Sparkles, Sprout } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { EvidenceChip } from './evidence-chip';

export type FeedbackKind = 'glow' | 'grow' | 'next';

const STYLE: Record<FeedbackKind, { icon: typeof Sparkles; ring: string; key: 'glow' | 'grow' | 'next'; hint: 'glowHint' | 'growHint' | 'nextHint' }> = {
  glow: { icon: Sparkles, ring: 'border-l-success', key: 'glow', hint: 'glowHint' },
  grow: { icon: Sprout, ring: 'border-l-amber', key: 'grow', hint: 'growHint' },
  next: { icon: Footprints, ring: 'border-l-primary', key: 'next', hint: 'nextHint' },
};

type Props = {
  kind: FeedbackKind;
  text: string;
  evidence?: { id: string; ms: number }[];
  onSeek?: (ms: number) => void;
  children?: React.ReactNode; // e.g. Agree / Add context controls
  className?: string;
};

/** Glow / Grow / Next step card with its evidence chips (PRD §9 signature component). */
export function FeedbackCard({ kind, text, evidence = [], onSeek, children, className }: Props) {
  const t = useTranslations('feedback');
  const s = STYLE[kind];
  const Icon = s.icon;
  return (
    <article
      data-kind={kind}
      aria-label={t(s.key)}
      className={cn('rounded-xl border border-l-4 bg-card p-4 shadow-sm', s.ring, className)}
    >
      <header className="mb-2 flex items-center gap-2">
        <Icon aria-hidden className="size-4" />
        <h3 className="text-sm font-semibold">{t(s.key)}</h3>
        <span className="text-xs text-muted-foreground">{t(s.hint)}</span>
      </header>
      <p className="leading-relaxed">{text}</p>
      {evidence.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {evidence.map((e) => (
            <EvidenceChip key={e.id} ms={e.ms} onSeek={onSeek} />
          ))}
        </div>
      )}
      {children && <div className="mt-3">{children}</div>}
    </article>
  );
}
