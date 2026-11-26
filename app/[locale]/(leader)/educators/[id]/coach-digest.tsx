import { MessageCircle } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { SectionTitle } from '@/components/tend/page-header';
import { createClient } from '@/lib/supabase/server';

/** Weekly coach digest: themes only. Opening details is logged and visible to the educator (PRD M5.7). */
export async function CoachDigest({ educatorId }: { educatorId: string }) {
  const supabase = await createClient();
  const t = await getTranslations('digest');
  const format = await getFormatter();
  // Themes are stored in English by the coach route; show them in the reader's language.
  const theme = (s: string) => (s.startsWith('Goal ') ? t('goalTheme', { code: s.slice(5) }) : s.startsWith('Wellbeing') ? t('wellbeing') : s);
  const { data } = await supabase.from('coach_digest').select('week_start, themes').eq('educator_id', educatorId).order('week_start', { ascending: false }).limit(1).maybeSingle();
  const themes = (data?.themes as { themes?: string[]; questions?: string[] } | undefined) ?? null;
  return (
    <section className="tend-card p-5" aria-labelledby="digest">
      <SectionTitle id="digest"><MessageCircle className="mr-1.5 inline size-4" aria-hidden />{t('title')}</SectionTitle>
      {!themes ? (
        <p className="text-sm text-muted-foreground">{t('none')}</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">{t('weekOf', { date: format.dateTime(new Date(data!.week_start), { day: 'numeric', month: 'short' }) })}</p>
          <ul className="grid list-disc gap-1 pl-5 text-sm">{(themes.themes ?? []).map((x) => <li key={x}>{theme(x)}</li>)}</ul>
          {(themes.questions ?? []).length > 0 && <p className="mt-2 text-sm text-muted-foreground">{t('askedAbout', { list: themes.questions!.join('; ') })}</p>}
        </>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{t('banner')}</p>
    </section>
  );
}
