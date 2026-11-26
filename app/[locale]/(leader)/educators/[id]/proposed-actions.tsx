import { getTranslations } from 'next-intl/server';
import { SectionTitle } from '@/components/tend/page-header';
import { createClient } from '@/lib/supabase/server';
import { EndorseButton } from './endorse-button';

/** Pathway items the educator proposed — the leader endorses (PRD M6.6). */
export async function ProposedActions({ idpId }: { idpId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('idp_action')
    .select('id, description, goal:idp_goal_id!inner(idp_id, indicator:indicator_id(code))')
    .eq('status', 'proposed')
    .eq('goal.idp_id', idpId);
  const rows = (data ?? []) as unknown as { id: string; description: string; goal: { indicator: { code: string } } }[];
  if (!rows.length) return null;
  const t = await getTranslations('proposed');
  return (
    <section className="tend-card p-5" aria-labelledby="proposed">
      <SectionTitle id="proposed" count={rows.length}>{t('title')}</SectionTitle>
      <ul className="grid gap-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
            <span><span className="tabular-nums text-muted-foreground">{r.goal.indicator.code}</span> {r.description}</span>
            <EndorseButton id={r.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}
