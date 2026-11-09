import { AreaLayout } from '@/components/shell/area-layout';

// Private, per-user pages: always render on request (auth + RLS), never prerender.
export const dynamic = 'force-dynamic';

export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <AreaLayout area="admin" locale={locale}>{children}</AreaLayout>;
}
