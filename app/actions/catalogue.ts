'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { serverGateway } from '@/lib/ai/server';
import { finaliseTags, type TagSuggestion } from '@/lib/ai/tasks/course-tags';
import { canAccess } from '@/lib/auth/roles';
import { getSession } from '@/lib/auth/session';
import { loadFramework, syncCatalogue, type SyncResult } from '@/lib/catalogue/sync';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * HQ curation of the shared course catalogue. The synced courses are sector-wide rows (org_id null), which
 * RLS lets nobody write, so these actions check the HQ/admin role here and then write with the service role.
 */
async function requireHq() {
  const session = await getSession();
  if (!session || !canAccess('hq', session.memberships)) throw new Error('Only HQ can curate programmes');
  return { userId: session.userId, admin: createAdminClient() };
}

const Id = z.string().uuid();

function done() {
  revalidatePath('/', 'layout'); // Programmes, Learn and Insights all read the catalogue
}

export async function syncNow(): Promise<SyncResult> {
  const { admin } = await requireHq();
  const result = await syncCatalogue({ admin, gateway: serverGateway(), trigger: 'manual', tagLimit: 30 });
  done();
  return result;
}

/** Accept the AI suggestion as-is: the course goes live and can be recommended in Learn. */
export async function approveCourse(id: string) {
  const { admin, userId } = await requireHq();
  const { data: row } = await admin.from('pd_activity').select('tag_suggestion').eq('id', Id.parse(id)).single();
  const s = row?.tag_suggestion as TagSuggestion | null;
  if (!s || !s.indicator_codes.length) throw new Error('No suggested skills to approve. Choose skills first.');
  const { error } = await admin
    .from('pd_activity')
    .update({
      status: 'active', indicator_codes: s.indicator_codes, subdomain_codes: s.subdomain_codes, tsc_codes: s.tsc_codes,
      level_min: s.level_min, level_max: s.level_max, tagged_by: 'ai', reviewed_by: userId, reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
  done();
}

const Tags = z.object({ indicatorCodes: z.array(z.string().max(20)).min(1).max(4), levelMin: z.number().int().min(1).max(3), levelMax: z.number().int().min(1).max(3) });

/** HQ picks the skills by hand (also used to correct a live course). The course goes live. */
export async function setCourseTags(id: string, input: z.infer<typeof Tags>) {
  const { admin, userId } = await requireHq();
  const v = Tags.parse(input);
  const fw = await loadFramework(admin);
  const t = finaliseTags({ relevant: true, indicator_codes: v.indicatorCodes, level_min: v.levelMin, level_max: v.levelMax, confidence: 'high', reason: 'Chosen by HQ' }, fw);
  if (!t.indicator_codes.length) throw new Error('Choose at least one framework indicator');
  const { error } = await admin
    .from('pd_activity')
    .update({
      status: 'active', indicator_codes: t.indicator_codes, subdomain_codes: t.subdomain_codes, tsc_codes: t.tsc_codes,
      level_min: t.level_min, level_max: t.level_max, tagged_by: 'hq', reviewed_by: userId, reviewed_at: new Date().toISOString(),
    })
    .eq('id', Id.parse(id));
  if (error) throw new Error(error.message);
  done();
}

/** Not suitable for educators: hidden everywhere. Can be restored for review later. */
export async function retireCourse(id: string) {
  const { admin, userId } = await requireHq();
  const { error } = await admin.from('pd_activity').update({ status: 'retired', reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq('id', Id.parse(id));
  if (error) throw new Error(error.message);
  done();
}

export async function restoreCourse(id: string) {
  const { admin } = await requireHq();
  const { error } = await admin.from('pd_activity').update({ status: 'pending_review' }).eq('id', Id.parse(id));
  if (error) throw new Error(error.message);
  done();
}
