import { describe, expect, it } from 'vitest';
import { buildWorld } from '@/supabase/seed/world';
import { DEMO_PERSONAS } from './demo';
import { demoSignInAllowed, homePathFor, type Membership } from './roles';

describe('demo personas match the seed', () => {
  const w = buildWorld(new Date('2026-11-06T02:00:00Z'));
  const users = w.tables.find(([t]) => t === 'app_user')![1];
  const memberships = w.tables.find(([t]) => t === 'membership')![1];

  it.each(DEMO_PERSONAS.map((p) => [p.email, p] as const))('%s exists with the right name', (email, p) => {
    const u = users.find((x) => x.email === email);
    expect(u, email).toBeDefined();
    expect(u!.full_name).toBe(p.name);
    expect(demoSignInAllowed(email, { DEMO_MODE: '1' })).toBe(true);
  });

  it('personas land on the right home page', () => {
    const home = (email: string) => {
      const id = users.find((x) => x.email === email)!.id;
      return homePathFor(memberships.filter((m) => m.user_id === id).map((m) => ({ role: m.role, centre_id: m.centre_id }) as Membership));
    };
    expect(home('sandra.tan@demo.tend.sg')).toBe('/today');
    expect(home('aisha.binte.rahman@demo.tend.sg')).toBe('/home');
    expect(home('daniel.koh@demo.tend.sg')).toBe('/network');
    expect(home('agape.it.admin@demo.tend.sg')).toBe('/admin');
  });

  it('Mdm Lee is seeded with Chinese UI and 130% text', () => {
    const u = users.find((x) => x.email === 'lee.mei.ling@demo.tend.sg')!;
    expect(u.locale).toBe('zh');
    expect(u.text_scale).toBe(130);
  });
});
