import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const PERSONA = {
  sandra: 'Sandra Tan',
  aisha: 'Aisha binte Rahman',
  meiling: 'Lee Mei Ling',
  farah: 'Farah Ismail',
  ravi: 'Ravi Kumar',
  daniel: 'Daniel Koh',
  admin: 'Agape IT Admin',
} as const;

/** Demo persona sign-in (DEMO_MODE only). Starts from a clean session. */
export async function signInAs(page: Page, who: keyof typeof PERSONA, locale: '' | 'zh' | 'ms' = '') {
  await page.context().clearCookies();
  await page.goto(locale ? `/${locale}/login` : '/login');
  await page.getByRole('button', { name: new RegExp(PERSONA[who]) }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'));
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

/** WCAG 2.2 AA scan: fail on serious/critical violations with a readable message. */
export async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const msg = serious.map((v) => `${v.id} [${v.nodes.slice(0, 3).map((n) => `${n.target.join(' ')} :: ${(n.failureSummary ?? '').replace(/\s+/g, ' ')}`).join(' | ')}]`).join(' ;; ');
  if (serious.length) throw new Error(`axe: ${msg}`);
}
