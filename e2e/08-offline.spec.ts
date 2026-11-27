import { expect, test } from '@playwright/test';
import { captureItems } from './db';
import { signInAs } from './helpers';

/**
 * PRD M4.7 "Works offline": the service worker only registers in a production build, so this spec
 * runs with E2E_PROD=1 (pnpm build && next start). Chromium's offline emulation skips requests made
 * BY the service worker unless PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 (scripts/e2e-local.mjs
 * sets it), otherwise the worker would quietly fetch over the network during "offline" steps.
 */
test.describe('Capture · works offline', () => {
  test.skip(process.env.E2E_PROD !== '1', 'service worker is production-only (set E2E_PROD=1)');

  test('notes taken with no signal survive a reload and upload, and End is finished by the service worker @mobile', async ({ page, context }) => {
    await signInAs(page, 'sandra');
    await page.goto('/observe');
    const activity = `Offline test ${Date.now()}`;
    await page.getByLabel('Educator').selectOption({ label: 'Ravi Kumar' });
    await page.getByLabel('Activity').fill(activity);
    await page.getByLabel('When (Singapore time)').fill('2026-12-16T09:30');
    await page.getByRole('button', { name: 'Schedule' }).click();
    await page.getByRole('link', { name: new RegExp(`Ravi Kumar · ${activity}`) }).click();
    await expect(page).toHaveURL(/\/observe\/[0-9a-f-]{36}$/);
    const id = page.url().split('/').pop()!;
    await page.getByRole('button', { name: 'Start observation' }).click();
    await expect(page.getByRole('button', { name: 'Record dictation' })).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForTimeout(1_000); // let the worker cache this page

    await context.setOffline(true);
    for (const text of ['Asks “what if the tower falls?”', 'Waits five seconds for answers']) {
      await page.getByLabel('Note', { exact: true }).fill(text);
      await page.getByRole('button', { name: 'Add note' }).click();
    }
    await expect(page.getByText('2 waiting to sync')).toBeVisible();

    // a reload with no signal still opens the capture page, and nothing was lost
    await page.reload();
    await expect(page.getByRole('button', { name: 'End observation' })).toBeVisible();
    await expect(page.getByText('2 waiting to sync')).toBeVisible();

    // End with no signal: the screen stays put and says so; the worker ends it once the notes are up,
    // and this screen then moves on to the review by itself.
    await page.getByRole('button', { name: 'End observation' }).click();
    await expect(page.getByRole('status').filter({ hasText: /No signal\. Everything is saved on this phone/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Waiting for signal/ })).toBeDisabled();
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(async () => (await captureItems(id, 'note')).length, { timeout: 30_000 }).toBe(2);
    await expect(page).toHaveURL(new RegExp(`/reviews/${id}$`), { timeout: 60_000 });
  });

  test('other pages show the offline page instead of an error', async ({ page, context }) => {
    await signInAs(page, 'aisha');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await page.goto('/learn').catch(() => {});
    await expect(page.getByRole('heading', { name: 'You’re offline' })).toBeVisible();
    await context.setOffline(false);
  });
});
