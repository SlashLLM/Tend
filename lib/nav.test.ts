import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../messages/en.json';
import zh from '../messages/zh.json';
import { HOME } from './auth/roles';
import { NAV, isActive, splitForMobile } from './nav';

const APP = join(__dirname, '..', 'app', '[locale]');
const groups = readdirSync(APP).filter((d) => d.startsWith('('));

/** Does any route group contain `<href>/page.tsx`? */
const pageExists = (href: string) => groups.some((g) => existsSync(join(APP, g, ...href.split('/').filter(Boolean), 'page.tsx')));

const get = (obj: unknown, path: string) => path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);

describe('navigation', () => {
  const all = Object.values(NAV).flat();

  it('every nav link has a page (no dead links)', () => {
    for (const it of all) expect(pageExists(it.href), it.href).toBe(true);
  });

  it('every role home page exists', () => {
    for (const href of Object.values(HOME)) expect(pageExists(href), href).toBe(true);
  });

  it('every nav label is translated in en and zh', () => {
    for (const it of all) {
      expect(typeof get(en, it.label), `en ${it.label}`).toBe('string');
      expect(typeof get(zh, it.label), `zh ${it.label}`).toBe('string');
    }
  });

  it('matches PRD §10: educator bar is Home · My Growth · (+ Reflect) · Coach · Learn', () => {
    expect(NAV.educator.map((i) => i.href)).toEqual(['/home', '/growth', '/reflect', '/coach', '/learn']);
    expect(NAV.educator.find((i) => i.primary)?.href).toBe('/reflect');
    expect(NAV.leader.map((i) => i.href)).toEqual(['/today', '/observe', '/reviews', '/educators', '/insights', '/metrics', '/settings']);
  });

  it('HQ sees Network · Framework Registry · Programmes; admin gets no Network (PRD access table: no heatmap)', () => {
    expect(NAV.hq.map((i) => i.href)).toEqual(['/network', '/registry', '/programmes']);
    expect(NAV.admin.map((i) => i.href)).toEqual(['/registry', '/programmes', '/admin']);
  });

  it('a URL path cannot be claimed by two route groups', () => {
    const seen = new Map<string, string>();
    for (const g of groups) {
      for (const d of readdirSync(join(APP, g), { withFileTypes: true }).filter((e) => e.isDirectory())) {
        if (d.name === 'registry') continue; // shared by hq + admin via the same (hq) page
        expect(seen.has(d.name), `/${d.name} in ${g} and ${seen.get(d.name)}`).toBe(false);
        seen.set(d.name, g);
      }
    }
  });

  it('splitForMobile keeps ≤5 bar items and puts the rest in More', () => {
    expect(splitForMobile(NAV.educator)).toEqual({ bar: NAV.educator, more: [] });
    const leader = splitForMobile(NAV.leader);
    expect(leader.bar).toHaveLength(4);
    expect(leader.more.map((i) => i.href)).toEqual(['/insights', '/metrics', '/settings']);
    expect(leader.bar.length + 1).toBeLessThanOrEqual(5);
  });

  it.each([
    ['/today', '/today', true], ['/zh/today', '/today', true], ['/reviews/abc', '/reviews', true],
    ['/reviewsx', '/reviews', false], ['/en', '/home', false], ['/zh', '/today', false],
  ])('isActive(%s, %s) = %s', (path, href, expected) => expect(isActive(path, href)).toBe(expected));
});
