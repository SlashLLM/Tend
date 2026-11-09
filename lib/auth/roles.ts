export type Role = 'educator' | 'leader' | 'mentor' | 'hq' | 'admin';
export type Membership = { role: Role; centre_id: string | null };
export type Area = 'educator' | 'leader' | 'hq' | 'admin';

/** Where each role lands after sign-in (PRD §10 navigation). */
export const HOME: Record<Area, string> = {
  leader: '/today',
  educator: '/home',
  hq: '/network',
  admin: '/admin',
};

/** Precedence when someone holds several roles: leader > mentor > hq > admin > educator. */
const PRECEDENCE: Role[] = ['leader', 'mentor', 'hq', 'admin', 'educator'];

export function primaryArea(memberships: Membership[]): Area | null {
  for (const role of PRECEDENCE) {
    if (memberships.some((m) => m.role === role)) {
      return role === 'mentor' ? 'leader' : (role as Area);
    }
  }
  return null;
}

export function homePathFor(memberships: Membership[]): string {
  const area = primaryArea(memberships);
  return area ? HOME[area] : '/no-access';
}

/** Which roles may open each area. */
const AREA_ROLES: Record<Area, Role[]> = {
  educator: ['educator'],
  leader: ['leader', 'mentor'],
  hq: ['hq', 'admin'],
  admin: ['admin'],
};

export function canAccess(area: Area, memberships: Membership[]): boolean {
  return memberships.some((m) => AREA_ROLES[area].includes(m.role));
}

export function leaderCentres(memberships: Membership[]): string[] {
  return memberships.filter((m) => m.role === 'leader' && m.centre_id).map((m) => m.centre_id as string);
}

/** Demo persona sign-in is only allowed in DEMO_MODE and only for synthetic demo accounts. */
export const DEMO_DOMAIN = '@demo.tend.sg';
export function demoSignInAllowed(email: string, env: Record<string, string | undefined> = process.env): boolean {
  return env.DEMO_MODE === '1' && email.toLowerCase().endsWith(DEMO_DOMAIN) && /^[a-z.]+@demo\.tend\.sg$/.test(email.toLowerCase());
}

/** Only allow relative, same-site redirect targets (prevents open redirects after login). */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || next.includes('://')) return fallback;
  return next;
}
