'use client';
import {
  BarChart3, BookOpen, ClipboardCheck, GraduationCap, Grid3x3, Home, LogOut, MessageCircle, Mic, MoreHorizontal, Network, Plus,
  Settings, Shield, Sprout, Sun, Users, type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { NAV, isActive, splitForMobile } from '@/lib/nav';
import type { Area } from '@/lib/auth/roles';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const ICONS: Record<string, LucideIcon> = {
  BarChart3, BookOpen, ClipboardCheck, GraduationCap, Grid3x3, Home, MessageCircle, Mic, Network, Plus, Settings, Shield, Sprout, Sun, Users,
};

type Props = { area: Area; userName: string; centreName?: string | null; children: React.ReactNode };

/** Bottom bar on phones, side rail on desktop. Icons are always labelled (PRD §9). */
export function AppShell({ area, userName, centreName, children }: Props) {
  const t = useTranslations();
  const pathname = usePathname();
  const items = NAV[area];
  const { bar, more } = splitForMobile(items);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      {/* desktop rail */}
      <aside className="sticky top-0 hidden h-dvh bg-[var(--rail)] md:flex md:flex-col">
        <div className="flex items-center gap-2.5 px-5 pb-6 pt-6">
          <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-primary font-heading text-sm font-bold text-primary-foreground">T</span>
          <span>
            <span className="block font-heading text-lg font-semibold leading-none">{t('app.name')}</span>
            <span className="block text-[0.7rem] text-muted-foreground">{t('app.tagline')}</span>
          </span>
        </div>
        <nav aria-label={t('nav.main')} className="flex-1 px-3">
          <ul className="grid gap-1">
            {items.map((it) => {
              const Icon = ICONS[it.icon];
              const active = isActive(pathname, it.href);
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-[background,box-shadow] duration-150',
                      active ? 'bg-card text-foreground shadow-[0_1px_2px_rgb(29_36_32/0.06),0_4px_12px_-6px_rgb(29_36_32/0.15)]' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
                    )}
                  >
                    <Icon aria-hidden className={cn('size-[1.15rem]', active && 'text-primary')} />
                    {t(it.label)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="mx-3 mb-3 rounded-xl bg-card/70 px-4 py-3 text-sm">
          <p className="font-medium">{userName}</p>
          {centreName && <p className="text-muted-foreground">{centreName}</p>}
          <Link href={area === 'educator' ? '/preferences' : area === 'leader' ? '/settings' : area === 'admin' ? '/admin' : '/network'} className="mt-2 block min-h-9 text-muted-foreground hover:text-foreground">{t('nav.preferences')}</Link>
          <form action="/auth/signout" method="post">
            <button className="inline-flex min-h-11 items-center gap-2 text-muted-foreground hover:text-foreground">
              <LogOut aria-hidden className="size-4" /> {t('auth.signOut')}
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col pb-20 md:pb-0">
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 md:px-8 md:py-8">
          {children}
        </main>
      </div>

      {/* phone bottom bar */}
      <nav aria-label={t('nav.main')} className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur md:hidden">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${bar.length + (more.length ? 1 : 0)}, minmax(0, 1fr))` }}>
          {bar.map((it) => {
            const Icon = ICONS[it.icon];
            const active = isActive(pathname, it.href);
            return (
              <li key={it.href}>
                <Link
                  href={it.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn('flex min-h-16 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-medium', active ? 'text-primary' : 'text-muted-foreground')}
                >
                  <span className={cn('grid place-items-center rounded-full', it.primary ? 'size-10 bg-primary text-primary-foreground' : 'size-6')}>
                    <Icon aria-hidden className="size-5" />
                  </span>
                  {t(it.label)}
                </Link>
              </li>
            );
          })}
          {more.length > 0 && (
            <li>
              <Popover>
                <PopoverTrigger className="flex min-h-16 w-full flex-col items-center justify-center gap-0.5 text-[0.7rem] font-medium text-muted-foreground">
                  <MoreHorizontal aria-hidden className="size-5" />
                  {t('nav.more')}
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-1">
                  {more.map((it) => {
                    const Icon = ICONS[it.icon];
                    return (
                      <Link key={it.href} href={it.href} className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm hover:bg-muted">
                        <Icon aria-hidden className="size-4" /> {t(it.label)}
                      </Link>
                    );
                  })}
                  <form action="/auth/signout" method="post">
                    <button className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm hover:bg-muted">
                      <LogOut aria-hidden className="size-4" /> {t('auth.signOut')}
                    </button>
                  </form>
                </PopoverContent>
              </Popover>
            </li>
          )}
        </ul>
      </nav>
    </div>
  );
}
