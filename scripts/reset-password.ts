/**
 * Give an existing account a one-time temporary password (they choose their own at next sign-in).
 * For bootstrapping the first admin — after that, admins reset passwords on the Admin page.
 *
 *   pnpm user:reset-password admin@your-org.sg
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from .env.local).
 */
import { createClient } from '@supabase/supabase-js';
import { generateTempPassword, MUST_CHANGE } from '../lib/auth/password';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error('Usage: pnpm user:reset-password <email>');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: profile } = await admin.from('app_user').select('id').eq('email', email).maybeSingle();
  if (!profile) throw new Error(`No Tend user with email ${email}`);
  const tempPassword = generateTempPassword();
  const { error } = await admin.auth.admin.updateUserById(profile.id, { password: tempPassword, email_confirm: true, app_metadata: { [MUST_CHANGE]: true } });
  if (error) throw new Error(error.message);
  console.log(`Temporary password for ${email}: ${tempPassword}\n(They will be asked to choose their own at sign-in.)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
