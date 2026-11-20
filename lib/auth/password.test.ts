import { describe, expect, it } from 'vitest';
import { checkNewPassword, generateTempPassword, mustChangePassword, PASSWORD_MIN } from './password';

describe('password', () => {
  it('temporary passwords are 4 groups of 4 unambiguous characters, and differ each time', () => {
    const a = generateTempPassword();
    expect(a).toMatch(/^[a-km-np-zA-HJ-NP-Z2-9]{4}(-[a-km-np-zA-HJ-NP-Z2-9]{4}){3}$/);
    expect(a.length - 3).toBeGreaterThanOrEqual(PASSWORD_MIN);
    expect(generateTempPassword()).not.toBe(a);
  });

  it('skips biased bytes (rejection sampling)', () => {
    let call = 0;
    // first batch is all 255 (rejected), then all 0 → 'a'
    const rand = (n: number) => new Uint8Array(n).fill(call++ === 0 ? 255 : 0);
    expect(generateTempPassword(rand)).toBe('aaaa-aaaa-aaaa-aaaa');
  });

  it.each([
    ['short', 'short', 'too_short'],
    ['long enough pw', 'different one', 'mismatch'],
    ['x'.repeat(73), 'x'.repeat(73), 'too_long'],
    ['long enough pw', 'long enough pw', null],
  ])('checkNewPassword(%s)', (p, c, want) => expect(checkNewPassword(p, c)).toBe(want));

  it('reads the must-change flag only when it is exactly true', () => {
    expect(mustChangePassword({ app_metadata: { must_change_password: true } })).toBe(true);
    expect(mustChangePassword({ app_metadata: { must_change_password: 'true' } })).toBe(false);
    expect(mustChangePassword({ app_metadata: {} })).toBe(false);
    expect(mustChangePassword(null)).toBe(false);
  });
});
