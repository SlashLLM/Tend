import { expect, test } from '@playwright/test';
import { axe, signInAs } from './helpers';

// Ravi and Farah have nothing scheduled in the demo world, so they can ask to be observed.
test.describe.configure({ mode: 'serial' });

test.describe('Educator asks, leader decides', () => {
  test('Ravi requests an observation, Sandra picks a time, Ravi sees it coming up', async ({ page }) => {
    await signInAs(page, 'ravi');
    await expect(page.getByRole('heading', { name: 'Ask your leader to observe you' })).toBeVisible();
    await axe(page);
    await page.getByLabel(/Anything they should know/).fill('Story time on Thursday, trying open questions');
    await page.getByRole('button', { name: 'Request an observation' }).click();
    await expect(page.getByRole('heading', { name: 'Your leader has your request' })).toBeVisible();
    await expect(page.getByText('trying open questions')).toBeVisible();

    await signInAs(page, 'sandra');
    const row = page.getByRole('link', { name: /Ravi Kumar.*Asked to be observed/ });
    await expect(row).toBeVisible();
    await row.click();
    await expect(page).toHaveURL(/\/observe\?request=/);
    await expect(page.getByRole('note').filter({ hasText: 'Ravi Kumar asked to be observed' })).toBeVisible();
    await expect(page.getByLabel('Educator')).toBeDisabled();
    await page.getByLabel('When (Singapore time)').fill('2031-03-13T10:00');
    await page.getByRole('button', { name: 'Schedule', exact: true }).click();
    await expect(page.getByRole('link', { name: /Ravi Kumar · Story time/ })).toBeVisible();
    await expect(page).toHaveURL(/\/observe$/);

    await signInAs(page, 'ravi');
    await expect(page.getByRole('region', { name: 'Upcoming observation' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ask your leader to observe you' })).toHaveCount(0);
  });

  test('Sandra can decline a request, and the educator can then ask again and withdraw', async ({ page }) => {
    await signInAs(page, 'meiling');
    await page.getByRole('button', { name: 'Request an observation' }).click();
    await expect(page.getByRole('heading', { name: 'Your leader has your request' })).toBeVisible();

    await signInAs(page, 'sandra');
    await page.getByRole('link', { name: /Lee Mei Ling.*Asked to be observed/ }).click();
    await page.getByRole('button', { name: 'Decline request' }).click();
    await expect(page).toHaveURL(/\/observe$/);
    await page.goto('/today');
    await expect(page.getByRole('link', { name: /Lee Mei Ling.*Asked to be observed/ })).toHaveCount(0);

    await signInAs(page, 'meiling');
    await page.getByRole('button', { name: 'Request an observation' }).click();
    await page.getByRole('button', { name: 'Withdraw request' }).click();
    await expect(page.getByRole('heading', { name: 'Ask your leader to observe you' })).toBeVisible();
  });
});
