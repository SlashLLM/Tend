import { describe, expect, it } from 'vitest';
import { buildMatrix, growingBySubdomain, proposeGroup, SUBDOMAINS, type HeatRow } from './heatmap';

const eds = [{ id: 'b', name: 'Bea' }, { id: 'a', name: 'Ann' }, { id: 'c', name: 'Cal' }];
const row = (e: string, sd: string, level: number, count: number, grows: number): HeatRow => ({ educator_id: e, full_name: e, subdomain_code: sd, latest_level: level, evidence_count: count, grow_count: grows });

describe('heatmap', () => {
  const m = buildMatrix([row('a', '3.4', 1, 3, 2), row('b', '3.4', 1, 1, 1), row('c', '3.4', 3, 5, 0), row('c', '1.1', 3, 4, 0), row('x', '1.1', 2, 1, 0), row('a', '9.9', 2, 1, 0)], eds);

  it('every educator has all 8 subdomain cells; unknown educators/subdomains are ignored', () => {
    expect(m.educators.map((e) => e.name)).toEqual(['Ann', 'Bea', 'Cal']);
    for (const e of m.educators) expect(Object.keys(m.cells[e.id])).toEqual([...SUBDOMAINS]);
    expect(m.cells.x).toBeUndefined();
    expect(m.cells.a['2.1']).toEqual({ level: null, count: 0, grows: 0 });
  });

  it('cells carry whole levels and counts only — no averages', () => {
    for (const e of m.educators) for (const s of SUBDOMAINS) {
      const c = m.cells[e.id][s];
      expect(c.level === null || [1, 2, 3].includes(c.level)).toBe(true);
    }
  });

  it('counts educators growing per subdomain', () => {
    expect(growingBySubdomain(m)['3.4']).toBe(2);
    expect(growingBySubdomain(m)['1.1']).toBe(0);
  });

  it('proposes a learning group with Level-3 peer leads who are not members', () => {
    const g = proposeGroup(m, '3.4');
    expect(g.members.map((x) => x.id).sort()).toEqual(['a', 'b']);
    expect(g.leads.map((x) => x.id)).toEqual(['c']);
  });
});
