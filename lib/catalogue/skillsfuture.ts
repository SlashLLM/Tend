import { readXlsx } from './xlsx';

/**
 * Download a dataset from data.gov.sg's open API (no key needed at this volume).
 * initiate-download prepares the file; poll-download returns a short-lived signed URL.
 * The MySkillsFuture exports are .xlsx even though the portal calls them "CSV".
 */
const API = 'https://api-open.data.gov.sg/v1/public/api/datasets';
const META = 'https://api-production.data.gov.sg/v2/public/api/datasets';

type Fetch = typeof fetch;

export async function datasetUpdatedAt(id: string, f: Fetch = fetch): Promise<string | null> {
  try {
    const res = await f(`${META}/${id}/metadata`);
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { lastUpdatedAt?: string } };
    return json.data?.lastUpdatedAt?.slice(0, 10) ?? null;
  } catch {
    return null;
  }
}

export async function downloadDataset(id: string, opts: { fetch?: Fetch; attempts?: number; waitMs?: number } = {}): Promise<Record<string, string>[]> {
  const f = opts.fetch ?? fetch;
  const attempts = opts.attempts ?? 10;
  await f(`${API}/${id}/initiate-download`).catch(() => undefined);
  let url: string | undefined;
  for (let i = 0; i < attempts && !url; i++) {
    const res = await f(`${API}/${id}/poll-download`);
    if (res.ok) url = ((await res.json()) as { data?: { url?: string } }).data?.url;
    if (!url && i < attempts - 1) await new Promise((r) => setTimeout(r, opts.waitMs ?? 2000));
  }
  if (!url) throw new Error(`data.gov.sg: download link for ${id} was not ready`);
  const file = await f(url);
  if (!file.ok) throw new Error(`data.gov.sg: download of ${id} failed (${file.status})`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Guard against the export format changing under us.
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error(`data.gov.sg: ${id} is no longer an .xlsx file`);
  return readXlsx(bytes);
}
