'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { LOCALES } from '@/i18n/routing';
import { homePathFor, primaryArea, type Membership } from '@/lib/auth/roles';
import { setLocaleCookie } from '@/lib/i18n/locale-cookie';
import { AI_NOTICE_VERSION, afterOnboardingPath } from '@/lib/onboarding';
import { parseTourState } from '@/lib/tours';
import { createClient } from '@/lib/supabase/server';

const Input = z.object({
  locale: z.enum(LOCALES),
  textScale: z.number().int().min(100).max(130),
  acknowledged: z.literal(true),
});

/**
 * Finish first sign-in: save language + text size, record the AI-processing notice acknowledgement
 * (a `consent` row, PRD §11) and mark the person onboarded. Runs as the user, so RLS applies.
 * Returns the path to continue to (locale prefix is added by the caller).
 */
export async function completeOnboarding(input: z.input<typeof Input>): Promise<{ next: string }> {
  const v = Input.parse(input);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const [{ data: me }, { data: memberships }, { data: existing }] = await Promise.all([
    supabase.from('app_user').select('org_id, onboarded_at, tour_state').eq('id', user.id).single(),
    supabase.from('membership').select('role, centre_id').eq('user_id', user.id),
    supabase.from('consent').select('id').eq('user_id', user.id).eq('kind', 'ai_processing_notice').eq('version', AI_NOTICE_VERSION).is('revoked_at', null).limit(1),
  ]);
  if (!me) throw new Error('No profile');

  if (!existing?.length) {
    const { error } = await supabase.from('consent').insert({ org_id: me.org_id, user_id: user.id, kind: 'ai_processing_notice', version: AI_NOTICE_VERSION });
    if (error) throw new Error(error.message);
  }
  const ms = (memberships ?? []) as Membership[];
  const area = primaryArea(ms);
  // First time only: start the role tour, so it opens on their first page (PRD M1 "Role tours").
  const tour = !me.onboarded_at && area ? { tour_state: { ...parseTourState(me.tour_state), [area]: 0 } } : {};
  const { error } = await supabase
    .from('app_user')
    .update({ locale: v.locale, text_scale: v.textScale, ...(me.onboarded_at ? {} : { onboarded_at: new Date().toISOString() }), ...tour })
    .eq('id', user.id);
  if (error) throw new Error(error.message);
  await setLocaleCookie(v.locale);
  revalidatePath('/', 'layout');

  return { next: afterOnboardingPath(area, homePathFor(ms)) };
}
