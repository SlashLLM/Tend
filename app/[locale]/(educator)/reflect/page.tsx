import { Lock, Users } from 'lucide-react';
import { PageHeader } from '@/components/tend/page-header';
import { getSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { JournalForm, DeleteEntry } from './journal';

export const metadata = { title: 'Reflect' };

export default async function ReflectPage() {
  const session = (await getSession())!;
  const supabase = await createClient();
  const { data } = await supabase.from('reflection').select('id, body, visibility, created_at').eq('educator_id', session.userId).order('created_at', { ascending: false }).limit(50);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader dateline="Reflection journal" title="Reflect" subtitle="Private by default. Private entries are never shown to your Centre Leader or HQ." />
      <JournalForm />
      <ol className="mt-6 grid gap-3">
        {(data ?? []).length === 0 && <li className="text-sm text-muted-foreground">Your reflections will appear here.</li>}
        {(data ?? []).map((r) => (
          <li key={r.id} className="tend-card grid gap-2 p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                {r.visibility === 'private' ? <><Lock className="size-3.5" aria-hidden /> Private</> : <><Users className="size-3.5" aria-hidden /> Shared with your leader</>}
                {' · '}{new Date(r.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })}
              </span>
              <DeleteEntry id={r.id} />
            </div>
            <p className="whitespace-pre-wrap text-sm">{r.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
