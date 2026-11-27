import type { Area } from '@/lib/auth/roles';

/**
 * Role tours (PRD M1): at most 5 steps, skippable, re-launchable. Each step points at a labelled
 * main-nav item (`href`), so it works on the phone bottom bar and on the desktop rail alike.
 * Text lives under `tour.<area>.<key>` in messages.
 */
export const TOURS: Record<Area, { key: string; href: string }[]> = {
  educator: [
    { key: 'home', href: '/home' },
    { key: 'growth', href: '/growth' },
    { key: 'reflect', href: '/reflect' },
    { key: 'coach', href: '/coach' },
    { key: 'learn', href: '/learn' },
  ],
  leader: [
    { key: 'today', href: '/today' },
    { key: 'observe', href: '/observe' },
    { key: 'reviews', href: '/reviews' },
    { key: 'educators', href: '/educators' },
    { key: 'insights', href: '/insights' },
  ],
  hq: [
    { key: 'network', href: '/network' },
    { key: 'registry', href: '/registry' },
    { key: 'programmes', href: '/programmes' },
  ],
  admin: [
    { key: 'admin', href: '/admin' },
    { key: 'registry', href: '/registry' },
    { key: 'programmes', href: '/programmes' },
  ],
};

export const MAX_TOUR_STEPS = 5;

/** Per-area progress kept in `app_user.tour_state`: a step index while in progress, or a final state. */
export type TourProgress = number | 'done' | 'skipped';
export type TourState = Partial<Record<Area, TourProgress>>;

export function parseTourState(raw: unknown): TourState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: TourState = {};
  for (const area of Object.keys(TOURS) as Area[]) {
    const v = (raw as Record<string, unknown>)[area];
    if (v === 'done' || v === 'skipped') out[area] = v;
    else if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < TOURS[area].length) out[area] = v;
  }
  return out;
}

/**
 * The step to open at automatically, or null to stay closed. Only an in-progress tour opens by
 * itself: onboarding starts it for new people, so existing accounts are never interrupted. Anyone
 * can launch it again from the menu ("Take the tour").
 */
export function tourAutoStep(state: TourState, area: Area): number | null {
  const v = state[area];
  return typeof v === 'number' ? v : null;
}
