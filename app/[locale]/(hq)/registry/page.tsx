import { getLocale, getTranslations } from 'next-intl/server';
import { frameworkName, indicatorLookFors } from '@/lib/i18n/content';
import { PageHeader, SectionTitle } from '@/components/tend/page-header';
import { IndicatorTag } from '@/components/tend/indicator-tag';
import { createClient } from '@/lib/supabase/server';
import { pageTitle } from '@/lib/i18n/meta';

export const generateMetadata = pageTitle('registry');

export default async function RegistryPage({ searchParams }: { searchParams: Promise<{ fw?: string }> }) {
  const { fw } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations('registry');
  const locale = await getLocale();
  const { data: versions } = await supabase.from('framework_version').select('id, version, status, activated_at, framework:framework_id(code, name, org_id)').order('created_at');
  const list = (versions ?? []) as unknown as { id: string; version: string; status: string; activated_at: string | null; framework: { code: string; name: string; org_id: string | null } }[];
  const current = list.find((v) => v.framework.code === (fw ?? 'QTT')) ?? list[0];
  const { data: inds } = current ? await supabase.from('indicator').select('code, name, subdomain_code, subdomain_name, look_fors').eq('framework_version_id', current.id).order('code') : { data: [] };
  const { count: tagCount } = current ? await supabase.from('tag').select('id', { count: 'exact', head: true }).eq('framework_version_id', current.id) : { count: 0 };

  return (
    <>
      <PageHeader dateline={t('dateline')} title={t('title')} subtitle={t('subtitle')} />
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <nav aria-label={t('frameworks')} className="tend-card grid content-start gap-1 p-2">
          {list.map((v) => (
            <a key={v.id} href={`?fw=${v.framework.code}`} aria-current={v.id === current?.id ? 'page' : undefined}
              className={`grid rounded-lg px-3 py-2 text-sm ${v.id === current?.id ? 'bg-secondary' : 'hover:bg-muted'}`}>
              <span className="font-medium">{frameworkName(locale, v.framework.code, v.framework.name)}</span>
              <span className="text-xs text-muted-foreground">v{v.version} · {t.has(`status.${v.status}`) ? t(`status.${v.status}`) : v.status}{v.framework.org_id ? t('agape') : t('global')}</span>
            </a>
          ))}
          <p className="px-3 pt-3 text-xs text-muted-foreground">{t('pilotNote')}</p>
        </nav>
        <section aria-labelledby="inds">
          <SectionTitle id="inds" count={(inds ?? []).length}>{current ? frameworkName(locale, current.framework.code, current.framework.name) : ''} · v{current?.version}</SectionTitle>
          <p className="-mt-1 mb-3 text-xs text-muted-foreground">{t('tagCount', { n: tagCount ?? 0 })}</p>
          <ul className="tend-card divide-y">
            {(inds ?? []).map((i) => (
              <li key={i.code} className="grid gap-1 p-3">
                <IndicatorTag code={i.code} name={i.name} className="self-start" />
                {(i.look_fors as string[]).length > 0 && <p className="text-xs text-muted-foreground">{t('lookFors', { list: indicatorLookFors(locale, i.code, i.look_fors as string[]).join(' · ') })}</p>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
