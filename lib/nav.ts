import { LOCALE_PREFIX_RE } from '@/i18n/routing';
import type { Area } from './auth/roles';

export type NavItem = { href: string; label: string; icon: string; primary?: boolean };

/** PRD §10 navigation. Labels are message keys; icons are Lucide names. */
export const NAV: Record<Area, NavItem[]> = {
  educator: [
    { href: '/home', label: 'nav.educator.home', icon: 'Home' },
    { href: '/growth', label: 'nav.educator.growth', icon: 'Sprout' },
    { href: '/reflect', label: 'nav.educator.reflect', icon: 'Plus', primary: true },
    { href: '/coach', label: 'nav.educator.coach', icon: 'MessageCircle' },
    { href: '/learn', label: 'nav.educator.learn', icon: 'GraduationCap' },
  ],
  leader: [
    { href: '/today', label: 'nav.leader.today', icon: 'Sun' },
    { href: '/observe', label: 'nav.leader.observe', icon: 'Mic' },
    { href: '/reviews', label: 'nav.leader.reviews', icon: 'ClipboardCheck' },
    { href: '/educators', label: 'nav.leader.educators', icon: 'Users' },
    { href: '/insights', label: 'nav.leader.insights', icon: 'Grid3x3' },
    { href: '/metrics', label: 'nav.leader.metrics', icon: 'BarChart3' },
    { href: '/settings', label: 'nav.leader.settings', icon: 'Settings' },
  ],
  hq: [
    { href: '/network', label: 'nav.hq.network', icon: 'Network' },
    { href: '/registry', label: 'nav.hq.registry', icon: 'BookOpen' },
    { href: '/programmes', label: 'nav.hq.programmes', icon: 'GraduationCap' },
  ],
  admin: [
    { href: '/admin', label: 'nav.hq.admin', icon: 'Shield' },
    { href: '/registry', label: 'nav.hq.registry', icon: 'BookOpen' },
  ],
};

/** On phones the bottom bar holds at most 5 items; the rest go in "More". */
export function splitForMobile(items: NavItem[], max = 5) {
  return items.length <= max ? { bar: items, more: [] } : { bar: items.slice(0, max - 1), more: items.slice(max - 1) };
}

export function isActive(pathname: string, href: string) {
  const p = pathname.replace(LOCALE_PREFIX_RE, '') || '/';
  return p === href || p.startsWith(`${href}/`);
}
