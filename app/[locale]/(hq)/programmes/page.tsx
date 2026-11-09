import { AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/tend/page-header';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Programmes' };

const TIER: Record<string, string> = { internal: 'In-house', micro: 'Micro-learning', course: 'Course' };

export default async function ProgrammesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from('pd_activity').select('id, tier, provider, title, mode, hours, fee_sgd, funded, next_run, indicator_codes, source_updated_at').order('tier').order('title');
  const stale = (d: string | null) => !d || Date.now() - new Date(d).getTime() > 90 * 86_400_000;
  return (
    <>
      <PageHeader dateline="Catalogue" title="Programmes" subtitle="Courses and in-house learning used for pathways. Sample titles in the demo — synced quarterly with ECDA and NIEC listings in the pilot." />
      <div className="tend-card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-muted-foreground"><tr className="border-b">{['Title', 'Type', 'Provider', 'Mode', 'Hours', 'Fee', 'Next run', 'Indicators'].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {(data ?? []).map((a) => (
              <tr key={a.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{a.title}{stale(a.source_updated_at) && <AlertTriangle className="ml-1 inline size-3.5 text-amber" aria-label="Listing older than 90 days" />}</td>
                <td className="px-3 py-2">{TIER[a.tier] ?? a.tier}</td>
                <td className="px-3 py-2">{a.provider}</td>
                <td className="px-3 py-2">{a.mode}</td>
                <td className="px-3 py-2 tabular-nums">{a.hours}</td>
                <td className="px-3 py-2 tabular-nums">{Number(a.fee_sgd) ? `S$${a.fee_sgd}` : 'Free'}{a.funded ? ' · funded' : ''}</td>
                <td className="px-3 py-2 tabular-nums">{a.next_run ?? '—'}</td>
                <td className="px-3 py-2 text-xs">{(a.indicator_codes as string[]).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
