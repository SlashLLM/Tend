import { MessageCircle } from 'lucide-react';
import { SectionTitle } from '@/components/tend/page-header';
import { createClient } from '@/lib/supabase/server';

/** Weekly coach digest: themes only. Opening details is logged and visible to the educator (PRD M5.7). */
export async function CoachDigest({ educatorId }: { educatorId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from('coach_digest').select('week_start, themes').eq('educator_id', educatorId).order('week_start', { ascending: false }).limit(1).maybeSingle();
  const themes = (data?.themes as { themes?: string[]; questions?: string[] } | undefined) ?? null;
  return (
    <section className="tend-card p-5" aria-labelledby="digest">
      <SectionTitle id="digest"><MessageCircle className="mr-1.5 inline size-4" aria-hidden />Coach themes</SectionTitle>
      {!themes ? (
        <p className="text-sm text-muted-foreground">No coach conversations this week.</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">Week of {new Date(data!.week_start).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}</p>
          <ul className="grid list-disc gap-1 pl-5 text-sm">{(themes.themes ?? []).map((t) => <li key={t}>{t}</li>)}</ul>
          {(themes.questions ?? []).length > 0 && <p className="mt-2 text-sm text-muted-foreground">Asked about: {themes.questions!.join('; ')}</p>}
        </>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Educators see a banner that you can see themes from their chats.</p>
    </section>
  );
}
