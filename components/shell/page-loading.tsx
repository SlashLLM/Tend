import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';

/** Shown inside the shell while a page's server data loads, so a nav click responds at once. */
export function PageLoading() {
  const t = useTranslations('common');
  return (
    <div role="status" aria-live="polite" className="grid gap-6">
      <span className="sr-only">{t('loading')}</span>
      <div className="grid gap-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
