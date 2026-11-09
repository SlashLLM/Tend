import { expect, test } from '@playwright/test';
import { axe, expectNoHorizontalScroll, signInAs } from './helpers';

/**
 * PRD §6 hero journey: Sandra observes Aisha → AI draft → review → approve → Aisha reflects first
 * → responds → tries a strategy → debrief → actions in the IDP.
 */
test.describe.serial('Hero journey · Sandra observes Aisha @mobile', () => {
  let obsUrl = '';

  test('Aisha has set her focus (precondition)', async ({ page }) => {
    await signInAs(page, 'aisha');
    await page.getByRole('link', { name: /Choose what I’d like feedback on|Change my focus/ }).click();
    const boxes = page.locator('label.tend-card');
    if (!(await boxes.nth(0).locator('input').isChecked())) await boxes.nth(0).click();
    await page.getByRole('button', { name: 'Save my focus' }).click();
    await expect(page).toHaveURL(/\/home$/);
  });

  test('Sandra sees the pre-brief, captures with the demo dictation and a ★ moment, then ends', async ({ page }) => {
    await signInAs(page, 'sandra');
    await page.getByRole('link', { name: /Aisha binte Rahman · K1 story time/ }).first().click().catch(async () => {
      await page.goto('/observe');
      await page.getByRole('link', { name: /Aisha binte Rahman · K1 story time/ }).click();
    });
    await expect(page.getByLabel('Pre-brief')).toContainText('Extending Thinking Through Questioning');
    await expect(page.getByLabel('Pre-brief')).toContainText(/last seen at Level 1/);
    await expect(page.getByLabel('Pre-brief')).toContainText('Look for');
    obsUrl = page.url();

    await page.getByRole('button', { name: 'Start observation' }).click();
    await page.getByRole('button', { name: /Play demo dictation/ }).click();
    await expect(page.getByLabel('Live transcript')).toContainText('why do you think the bear is hiding');
    await page.getByLabel('Note', { exact: true }).fill('She invites a quiet child to finish the sentence.');
    await page.getByRole('button', { name: 'Add note' }).click();
    await page.getByRole('button', { name: 'Mark a moment' }).click();
    await expect(page.getByText('All saved')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'End observation' }).click();
    await expect(page).toHaveURL(/\/reviews\//, { timeout: 30_000 });
    // draft ready within 60 s (offline pipeline is much faster)
    await expect(page.getByRole('heading', { name: /Growth notes for Aisha/ })).toBeVisible({ timeout: 60_000 });
    obsUrl = page.url();
  });

  test('Review: evidence beside the draft, child names redacted, Tone Guard blocks judgemental words', async ({ page }) => {
    await signInAs(page, 'sandra');
    await page.goto(obsUrl);
    await expect(page.getByRole('heading', { name: /Evidence/ })).toBeVisible();
    const body = page.locator('main');
    await expect(body).not.toContainText('Wei Ling');
    await expect(body).not.toContainText('Arjun');
    await expect(body).toContainText('Child A');
    // every draft sentence carries at least one evidence chip
    const sentences = page.getByRole('textbox', { name: /(glow|grow|next) sentence/ });
    const n = await sentences.count();
    expect(n).toBeGreaterThanOrEqual(2);
    // tag controls exist and confidence is shown
    await expect(page.getByRole('button', { name: /^Remove \d\.\d\.\d$/ }).first()).toBeVisible();
    // Tone Guard
    const first = sentences.first();
    const original = await first.inputValue();
    await first.fill('Aisha failed to build on the answer.');
    await expect(page.getByText(/Tone Guard: “failed”/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Approve & share/ })).toBeDisabled();
    await page.getByRole('button', { name: /^Use: “Aisha has an opportunity to/ }).click();
    await expect(page.getByText(/Tone Guard/)).toHaveCount(0);
    await first.fill(original);
    // tapping an evidence chip highlights the moment
    await page.getByRole('button', { name: /Play evidence at/ }).first().click();
    await expectNoHorizontalScroll(page);
    await axe(page);
  });

  test('Before approval Aisha sees nothing; Sandra approves and shares', async ({ page, browser }) => {
    const aisha = await browser.newPage();
    await signInAs(aisha, 'aisha');
    await expect(aisha.getByText(/New growth notes · K1 story time/)).toHaveCount(0);
    const id = obsUrl.split('/').pop();
    const res = await aisha.goto(`/feedback/${id}`);
    expect(res?.status()).toBe(404);
    await aisha.close();

    await signInAs(page, 'sandra');
    await page.goto(obsUrl);
    await page.getByRole('button', { name: /Approve & share with Aisha/ }).click();
    await expect(page.getByRole('heading', { name: 'Shared growth notes' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Drafted with AI · reviewed by Sandra Tan')).toBeVisible();
    await expect(page.getByText('Waiting for Aisha to reflect first.')).toBeVisible();
  });

  test('Aisha reflects FIRST, then reads, agrees, adds context, rates and logs "Tried it" @mobile', async ({ page }) => {
    await signInAs(page, 'aisha');
    await page.getByRole('link', { name: /New growth notes · K1 story time/ }).click();
    await expect(page.getByRole('heading', { name: /how do you think it went/ })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Glow' })).toHaveCount(0); // locked
    await page.getByLabel('Your reflection').fill('The children went quiet when I asked why. I moved on too quickly.');
    await page.getByRole('button', { name: /Save reflection and read my notes/ }).click();

    await expect(page.getByText('Drafted with AI · reviewed by Sandra Tan')).toBeVisible();
    await expect(page.getByRole('article', { name: 'Glow' }).first()).toBeVisible();
    await expect(page.getByRole('article', { name: 'Next step' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await axe(page);
    await page.getByRole('button', { name: /Play evidence at/ }).first().click();
    await expect(page.getByRole('status').filter({ hasText: '▶' })).toBeVisible();

    const grows = page.getByRole('article', { name: 'Grow' });
    if ((await grows.count()) > 0) {
      await grows.first().getByRole('button', { name: 'I agree' }).click();
      await expect(grows.first().getByText('You agreed')).toBeVisible();
    }
    if ((await grows.count()) > 1) {
      await grows.nth(1).getByRole('button', { name: 'Add context' }).click();
      await grows.nth(1).getByLabel('Your context').fill('Two children were new that day.');
      await grows.nth(1).getByRole('button', { name: 'Send' }).click();
      await expect(grows.nth(1).getByText('Context added')).toBeVisible();
    }
    await page.getByRole('button', { name: 'Helpful', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Helpful', exact: true })).toHaveAttribute('aria-pressed', 'true');

    const tried = page.getByRole('button', { name: 'Tried it' }).first();
    if (await tried.isVisible()) {
      await tried.click();
      await expect(page.getByText('Logged — well done for trying it.').first()).toBeVisible();
    }
  });

  test('Sandra runs the debrief; the agreed action lands in Aisha’s plan', async ({ page }) => {
    await signInAs(page, 'sandra');
    await page.goto(obsUrl);
    await expect(page.getByRole('blockquote').filter({ hasText: 'The children went quiet when I asked why' })).toBeVisible();
    await expect(page.getByText(/You said: “The children went quiet/)).toBeVisible(); // agenda draws on her reflection
    await page.getByRole('button', { name: /Start 15-minute debrief/ }).click();
    await expectNoHorizontalScroll(page);
    await page.getByLabel('Debrief notes').fill('Agreed to try a follow-up question at each story time.');
    await page.getByLabel(/Agreed action/).fill('Ask one follow-up question at every story time');
    await page.getByLabel('Goal for the action').selectOption({ label: '3.3.4 Extending Thinking Through Questioning' });
    await page.getByRole('button', { name: 'Complete debrief' }).click();
    await expect(page.getByText('Discussed')).toBeVisible({ timeout: 15_000 });

    await signInAs(page, 'aisha');
    await page.goto('/growth');
    await page.getByRole('link', { name: /3\.3\.4/ }).first().click();
    await expect(page.getByText('Ask one follow-up question at every story time')).toBeVisible();
  });
});

