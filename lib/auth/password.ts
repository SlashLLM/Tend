/**
 * Email + password sign-in. Accounts are created by an admin with a one-time temporary password;
 * the person must choose their own at first sign-in. A forgotten password is reset by an admin,
 * which issues a new temporary one. No email is ever sent.
 */

/** Must match `minimum_password_length` in supabase/config.toml (and the hosted project's Auth settings). */
export const PASSWORD_MIN = 10;
/** bcrypt ignores bytes past 72. */
export const PASSWORD_MAX = 72;

/** Flag in the auth user's app_metadata (only the service role can change it, not the user). */
export const MUST_CHANGE = 'must_change_password';

export function mustChangePassword(user: { app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  return user?.app_metadata?.[MUST_CHANGE] === true;
}

// No 0/O, 1/l/I: temporary passwords are read aloud or copied by hand.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** e.g. "k7Mp-2xQv-Hn4c-W9tz": 16 random characters (~92 bits), grouped for reading. */
export function generateTempPassword(rand: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const out: string[] = [];
  // rejection sampling keeps every character equally likely
  const limit = 256 - (256 % ALPHABET.length);
  while (out.length < 16) {
    for (const b of rand(32)) {
      if (b < limit && out.length < 16) out.push(ALPHABET[b % ALPHABET.length]);
    }
  }
  return [0, 4, 8, 12].map((i) => out.slice(i, i + 4).join('')).join('-');
}

export type PasswordProblem = 'too_short' | 'too_long' | 'mismatch';

export function checkNewPassword(password: string, confirm: string): PasswordProblem | null {
  if (password.length < PASSWORD_MIN) return 'too_short';
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) return 'too_long';
  if (password !== confirm) return 'mismatch';
  return null;
}
