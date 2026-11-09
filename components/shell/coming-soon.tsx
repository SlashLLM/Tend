import { getTranslations } from 'next-intl/server';

/** Placeholder for screens scheduled later in the sprint (see IMPLEMENTATION_PLAN.md). */
export async function ComingSoon({ titleKey, day }: { titleKey: string; day: number }) {
  const t = await getTranslations();
  return (
    <section className="grid gap-2">
      <h1 className="text-2xl font-semibold">{t(titleKey)}</h1>
      <p className="text-muted-foreground">Arrives on build day {day}.</p>
    </section>
  );
}
