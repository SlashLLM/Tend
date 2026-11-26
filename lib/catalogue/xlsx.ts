import { unzipSync, strFromU8 } from 'fflate';

/**
 * Minimal .xlsx reader for the data.gov.sg exports: first sheet, shared + inline strings, no styles/formulas.
 * Returns rows as objects keyed by the header row. Small and dependency-light on purpose.
 */
export function readXlsx(bytes: Uint8Array): Record<string, string>[] {
  const files = unzipSync(bytes, { filter: (f) => f.name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(f.name) });
  const sheetName = Object.keys(files).filter((n) => n.startsWith('xl/worksheets/')).sort()[0];
  if (!sheetName) throw new Error('xlsx: no worksheet found');
  const shared = files['xl/sharedStrings.xml'] ? parseSharedStrings(strFromU8(files['xl/sharedStrings.xml'])) : [];
  const rows = parseSheet(strFromU8(files[sheetName]), shared);
  const [header, ...data] = rows;
  if (!header) return [];
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function decodeXml(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
      e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e.toLowerCase()],
    )
    .replace(/_x000D_/g, '');
}

/** Concatenate all <t> runs inside an element (rich text has several). */
function textOf(xml: string): string {
  let out = '';
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1];
  return decodeXml(out);
}

export function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)) out.push(m[1] ? textOf(m[1]) : '');
  return out;
}

export function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.match(/^[A-Z]+/)![0]) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

export function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
      if (!ref) continue;
      const type = attrs.match(/\bt="(\w+)"/)?.[1];
      const body = c[2] ?? '';
      let val = '';
      if (type === 'inlineStr') val = textOf(body);
      else {
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (v !== undefined) val = type === 's' ? (shared[Number(v)] ?? '') : decodeXml(v);
      }
      cells[colIndex(ref)] = val;
    }
    rows.push(Array.from(cells, (v) => v ?? ''));
  }
  return rows;
}
