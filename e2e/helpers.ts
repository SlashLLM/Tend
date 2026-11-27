import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';

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
  // Let enter animations (toasts, dialogs) finish: mid-fade, text sits on a half-transparent
  // background and reads as low contrast. Endless ones (spinners, the record pulse) are skipped.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const msg = serious.map((v) => `${v.id} [${v.nodes.slice(0, 3).map((n) => `${n.target.join(' ')} :: ${(n.failureSummary ?? '').replace(/\s+/g, ' ')}`).join(' | ')}]`).join(' ;; ');
  if (serious.length) throw new Error(`axe: ${msg}`);
}

/**
 * Click a link until the URL changes. On the production server pages load fast enough that a click
 * can land while React is still hydrating and be dropped; a person would simply tap again.
 */
export async function clickUntilUrl(page: Page, link: Locator, url: RegExp) {
  await expect(async () => {
    if (!url.test(page.url())) await link.click();
    await expect(page).toHaveURL(url, { timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
}
