/** Centre heatmap model (PRD M7.3): educators × 8 subdomains, latest level + evidence count. No averages. */
export const SUBDOMAINS = ['1.1', '2.1', '2.2', '2.3', '3.1', '3.2', '3.3', '3.4'] as const;

export type HeatRow = { educator_id: string; full_name: string; subdomain_code: string; latest_level: number | null; evidence_count: number; grow_count: number };
export type Cell = { level: number | null; count: number; grows: number };
export type Matrix = { educators: { id: string; name: string }[]; cells: Record<string, Record<string, Cell>> };

export function buildMatrix(rows: HeatRow[], educators: { id: string; name: string }[]): Matrix {
  const cells: Matrix['cells'] = {};
  for (const e of educators) cells[e.id] = Object.fromEntries(SUBDOMAINS.map((s) => [s, { level: null, count: 0, grows: 0 }]));
  for (const r of rows) {
    if (!cells[r.educator_id] || !(SUBDOMAINS as readonly string[]).includes(r.subdomain_code)) continue;
    cells[r.educator_id][r.subdomain_code] = { level: r.latest_level, count: r.evidence_count, grows: r.grow_count };
  }
  return { educators: [...educators].sort((a, b) => a.name.localeCompare(b.name)), cells };
}

/** How many educators are growing in each subdomain (have ≥1 Grow) — for "9 of 15 growing in 3.4". */
export function growingBySubdomain(m: Matrix) {
  return Object.fromEntries(SUBDOMAINS.map((s) => [s, m.educators.filter((e) => m.cells[e.id][s].grows > 0).length]));
}

/** Learning-group proposal: members = growing in the subdomain; peer leads = seen at Level 3 there (not members). */
export function proposeGroup(m: Matrix, subdomain: string, maxLeads = 2) {
  const members = m.educators.filter((e) => m.cells[e.id][subdomain]?.grows > 0);
  const leads = m.educators
    .filter((e) => m.cells[e.id][subdomain]?.level === 3 && !members.some((x) => x.id === e.id))
    .sort((a, b) => m.cells[b.id][subdomain].count - m.cells[a.id][subdomain].count)
    .slice(0, maxLeads);
  return { members, leads };
}
