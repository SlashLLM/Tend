import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
  /** One sentence (PRD M1.4: every empty screen shows one sentence and one action). */
  message: string;
  actionLabel: string;
  href?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
  className?: string;
};

export function EmptyState({ message, actionLabel, href, onAction, icon, className }: Props) {
  return (
    <div className={cn('flex flex-col items-center gap-4 rounded-xl border border-dashed bg-card/50 px-6 py-10 text-center', className)}>
      {icon && <div aria-hidden className="text-muted-foreground">{icon}</div>}
      <p className="max-w-sm text-muted-foreground">{message}</p>
      {href ? (
        <Button asChild className="min-h-11">
          <Link href={href}>{actionLabel}</Link>
        </Button>
      ) : (
        <Button onClick={onAction} className="min-h-11">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
