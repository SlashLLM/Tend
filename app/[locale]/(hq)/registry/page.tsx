import { PageHeader, SectionTitle } from '@/components/tend/page-header';
import { IndicatorTag } from '@/components/tend/indicator-tag';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Framework Registry' };

export default async function RegistryPage({ searchParams }: { searchParams: Promise<{ fw?: string }> }) {
  const { fw } = await searchParams;
  const supabase = await createClient();
  const { data: versions } = await supabase.from('framework_version').select('id, version, status, activated_at, framework:framework_id(code, name, org_id)').order('created_at');
  const list = (versions ?? []) as unknown as { id: string; version: string; status: string; activated_at: string | null; framework: { code: string; name: string; org_id: string | null } }[];
  const current = list.find((v) => v.framework.code === (fw ?? 'QTT')) ?? list[0];
  const { data: inds } = current ? await supabase.from('indicator').select('code, name, subdomain_code, subdomain_name, look_fors').eq('framework_version_id', current.id).order('code') : { data: [] };
  const { count: tagCount } = current ? await supabase.from('tag').select('id', { count: 'exact', head: true }).eq('framework_version_id', current.id) : { count: 0 };

  return (
    <>
      <PageHeader dateline="Frameworks as data" title="Framework Registry" subtitle="QTT, Skills Framework, the infant & toddler set and Agape’s values — versioned, so an update needs no code and old records keep the version they were made with." />
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <nav aria-label="Frameworks" className="tend-card grid content-start gap-1 p-2">
          {list.map((v) => (
            <a key={v.id} href={`?fw=${v.framework.code}`} aria-current={v.id === current?.id ? 'page' : undefined}
              className={`grid rounded-lg px-3 py-2 text-sm ${v.id === current?.id ? 'bg-secondary' : 'hover:bg-muted'}`}>
              <span className="font-medium">{v.framework.name}</span>
              <span className="text-xs text-muted-foreground">v{v.version} · {v.status}{v.framework.org_id ? ' · Agape' : ' · global'}</span>
            </a>
          ))}
          <p className="px-3 pt-3 text-xs text-muted-foreground">Upload → compare → re-map → activate arrives in the pilot (P1).</p>
        </nav>
        <section aria-labelledby="inds">
          <SectionTitle id="inds" count={(inds ?? []).length}>{current?.framework.name} · v{current?.version}</SectionTitle>
          <p className="-mt-1 mb-3 text-xs text-muted-foreground">{tagCount ?? 0} evidence tags reference this version.</p>
          <ul className="tend-card divide-y">
            {(inds ?? []).map((i) => (
              <li key={i.code} className="grid gap-1 p-3">
                <IndicatorTag code={i.code} name={i.name} className="self-start" />
                {(i.look_fors as string[]).length > 0 && <p className="text-xs text-muted-foreground">Look-fors: {(i.look_fors as string[]).join(' · ')}</p>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
