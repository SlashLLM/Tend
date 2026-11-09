import { expect, test } from '@playwright/test';
import { axe, expectNoHorizontalScroll, signInAs } from './helpers';

test.describe('Day 1 · sign-in, roles, shell', () => {
  test('signed-out visitors are sent to sign-in, keeping the language @mobile', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/today');
    await expect(page).toHaveURL(/\/login\?next=%2Ftoday/);
    await expect(page.getByRole('heading', { name: 'Sign in to Tend' })).toBeVisible();
    await axe(page);
    await page.goto('/zh/home');
    await expect(page).toHaveURL(/\/zh\/login/);
    await expect(page.getByRole('heading', { name: '登录 Tend' })).toBeVisible();
  });

  test('Sandra (leader) lands on Today with Ravi’s draft waiting', async ({ page }) => {
    await signInAs(page, 'sandra');
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByRole('heading', { name: 'Good to see you, Sandra' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Ravi Kumar.*Review draft/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Nurul Huda.*Debrief due/ })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).first()).toBeVisible();
    await axe(page);
  });

  test('Aisha (educator) lands on Home with her goals and upcoming story time @mobile', async ({ page }) => {
    await signInAs(page, 'aisha');
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByText('K1 story time')).toBeVisible();
    await expect(page.getByText('Extending Thinking Through Questioning').first()).toBeVisible();
    await expect(page.getByRole('img', { name: /Seen at Level 1 · next: try Level 2/ }).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/score|ranking/i);
    await expectNoHorizontalScroll(page);
    await axe(page);
  });

  test('an educator cannot open leader or HQ pages', async ({ page }) => {
    await signInAs(page, 'aisha');
    await page.goto('/today');
    await expect(page).toHaveURL(/\/home$/);
    await page.goto('/network');
    await expect(page).toHaveURL(/\/home$/);
  });

  test('Daniel (HQ) lands on Network; admin lands on Admin', async ({ page }) => {
    await signInAs(page, 'daniel');
    await expect(page).toHaveURL(/\/network$/);
    await signInAs(page, 'admin');
    await expect(page).toHaveURL(/\/admin$/);
  });

  test('Mdm Lee gets the Chinese interface at 130% text', async ({ page }) => {
    await signInAs(page, 'meiling', 'zh');
    await expect(page).toHaveURL(/\/zh\/home$/);
    await expect(page.getByRole('navigation', { name: '主导航' }).first()).toBeVisible();
    const scale = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text-scale').trim());
    expect(scale).toBe('130');
  });

  test('sign out ends the session', async ({ page }) => {
    await signInAs(page, 'sandra');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/today');
    await expect(page).toHaveURL(/\/login/);
  });
});
