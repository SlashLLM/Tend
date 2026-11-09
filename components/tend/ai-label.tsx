'use client';
import { Bot } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/** "Drafted with AI · reviewed by Sandra Tan" — on every piece of AI content (PRD §9). */
export function AiLabel({ reviewer, className }: { reviewer?: string | null; className?: string }) {
  const t = useTranslations('feedback');
  return (
    <p className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <Bot aria-hidden className="size-3.5" />
      {reviewer ? t('aiLabel', { name: reviewer }) : t('aiDraft')}
    </p>
  );
}
