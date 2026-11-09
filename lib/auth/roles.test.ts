import { describe, expect, it } from 'vitest';
import { canAccess, demoSignInAllowed, homePathFor, leaderCentres, primaryArea, safeNext, type Membership } from './roles';

const m = (role: Membership['role'], centre: string | null = 'c1'): Membership => ({ role, centre_id: role === 'hq' || role === 'admin' ? null : centre });

describe('landing page per role (Day 1 checkpoint)', () => {
  it('Sandra (leader) → Today, Aisha (educator) → Home, Daniel (HQ) → Network, admin → Admin', () => {
    expect(homePathFor([m('leader')])).toBe('/today');
    expect(homePathFor([m('educator')])).toBe('/home');
    expect(homePathFor([m('hq')])).toBe('/network');
    expect(homePathFor([m('admin')])).toBe('/admin');
  });

  it('a user with no membership gets no access', () => {
    expect(homePathFor([])).toBe('/no-access');
    expect(primaryArea([])).toBeNull();
  });

  it('multiple roles: leader wins; mentor uses the leader area; hq beats admin and educator', () => {
    expect(primaryArea([m('educator'), m('leader')])).toBe('leader');
    expect(primaryArea([m('educator'), m('mentor')])).toBe('leader');
    expect(primaryArea([m('admin'), m('hq')])).toBe('hq');
    expect(primaryArea([m('educator'), m('admin')])).toBe('admin');
  });
});

describe('area access', () => {
  it('educators cannot open leader, HQ or admin areas', () => {
    const e = [m('educator')];
    expect(canAccess('educator', e)).toBe(true);
    expect(canAccess('leader', e)).toBe(false);
    expect(canAccess('hq', e)).toBe(false);
    expect(canAccess('admin', e)).toBe(false);
  });

  it('leaders cannot open HQ/admin; HQ cannot open admin; admin can open HQ', () => {
    expect(canAccess('hq', [m('leader')])).toBe(false);
    expect(canAccess('admin', [m('hq')])).toBe(false);
    expect(canAccess('hq', [m('admin')])).toBe(true);
    expect(canAccess('leader', [m('mentor')])).toBe(true);
  });

  it('leaderCentres lists only centres where the user leads', () => {
    expect(leaderCentres([m('leader', 'a'), m('educator', 'b'), m('leader', 'c')])).toEqual(['a', 'c']);
  });
});

describe('demo persona sign-in guard', () => {
  it('only in DEMO_MODE=1 and only for synthetic demo emails', () => {
    expect(demoSignInAllowed('sandra.tan@demo.tend.sg', { DEMO_MODE: '1' })).toBe(true);
    expect(demoSignInAllowed('sandra.tan@demo.tend.sg', {})).toBe(false);
    expect(demoSignInAllowed('sandra.tan@demo.tend.sg', { DEMO_MODE: 'true' })).toBe(false);
    expect(demoSignInAllowed('real.person@agape.sg', { DEMO_MODE: '1' })).toBe(false);
    expect(demoSignInAllowed('evil@demo.tend.sg.attacker.com', { DEMO_MODE: '1' })).toBe(false);
    expect(demoSignInAllowed('x+y@demo.tend.sg', { DEMO_MODE: '1' })).toBe(false);
  });
});

describe('safeNext (no open redirects after login)', () => {
  it.each([
    ['/today', '/today'],
    ['/zh/home?x=1', '/zh/home?x=1'],
    [null, '/'],
    ['', '/'],
    ['https://evil.com', '/'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['/redirect?to=https://evil.com', '/'],
    ['javascript:alert(1)', '/'],
  ])('%s → %s', (input, out) => expect(safeNext(input as string | null)).toBe(out));
});
