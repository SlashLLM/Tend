import { cn } from '@/lib/utils';

/** Notebook-page header: muted dateline, tight display title, optional supporting line and actions. */
export function PageHeader({
  dateline,
  title,
  subtitle,
  actions,
  className,
}: {
  dateline?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between', className)}>
      <div className="min-w-0">
        {dateline && <p className="tend-dateline mb-2">{dateline}</p>}
        <h1 className="tend-page-title">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** Section heading with an optional count, Todoist-style. */
export function SectionTitle({ children, count, id, action }: { children: React.ReactNode; count?: number; id?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-base font-semibold">
        {children}
        {count != null && <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">{count}</span>}
      </h2>
      {action}
    </div>
  );
}
