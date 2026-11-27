import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, signInAs } from './helpers';

test.describe.serial('Day 2 · needs analysis → Growth Snapshot → co-created IDP', () => {
  // Mdm Lee's profile language is Chinese, so the app serves her the zh interface (PRD §4 persona).
  test('Mdm Lee completes her needs analysis on a phone, with autosave and resume @mobile', async ({ page }) => {
    await signInAs(page, 'meiling', 'zh');
    await page.goto('/zh/growth');
    await expect(page.getByRole('heading', { name: '从需求分析开始' })).toBeVisible();
    await page.getByRole('link', { name: /开始我的需求分析/ }).click();
    await expect(page.getByText('1 / 32')).toBeVisible();

    const answerCurrent = async () => {
      const card = page.locator('section.tend-card');
      await card.getByRole('radio').first().click();
    };
    // answer 10, leave, come back → resumes at 11
    for (let i = 1; i <= 10; i++) {
      await answerCurrent();
      await expect(page.getByText(`${i + 1} / 32`)).toBeVisible();
    }
    await page.goto('/zh/home');
    await page.goto('/zh/growth/needs-analysis');
    await expect(page.getByText('11 / 32')).toBeVisible();
    await expectNoHorizontalScroll(page);
    for (let i = 11; i <= 32; i++) {
      await answerCurrent();
      if (i < 32) await expect(page.getByText(`${i + 1} / 32`)).toBeVisible();
    }
    await page.getByRole('button', { name: /查看我的成长概览/ }).click();
    await expect(page).toHaveURL(/\/zh\/growth\/snapshot$/);
    await expect(page.getByRole('heading', { name: '你正在成长的方向' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /强项/ })).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/\d+\s*%/); // no numbers-as-grades for people
    await page.getByRole('radio', { name: '是', exact: true }).click();
    await expect(page.getByText('谢谢，已记录。')).toBeVisible();
    await page.getByRole('link', { name: /完善我的计划/ }).click();
    await expect(page.getByText(/计划草稿/)).toBeVisible();
    await expect(page.getByText(/^目标 1$/)).toBeVisible();
  });

  test('Mdm Lee edits her draft and confirms; it stays a draft until the leader confirms', async ({ page }) => {
    await signInAs(page, 'meiling', 'zh');
    await page.goto('/zh/growth');
    const firstGoal = page.locator('ol > li.tend-card').first();
    await firstGoal.getByRole('radiogroup').nth(1).getByRole('radio', { name: /第3级/ }).click();
    await firstGoal.getByLabel(/新增行动/).fill('Watch a colleague’s story time');
    await firstGoal.getByRole('button', { name: '添加', exact: true }).click();
    await expect(firstGoal.getByText('Watch a colleague’s story time')).toBeVisible();
    await page.getByRole('button', { name: '确认此计划' }).click();
    await expect(page.getByRole('button', { name: '你已确认' })).toBeVisible();
    await expect(page.locator('p').filter({ hasText: /^中心领导/ }).filter({ hasText: '尚未确认' })).toBeVisible();
  });

  test('Sandra sees the draft on Today, co-edits and confirms → the plan becomes active', async ({ page }) => {
    await signInAs(page, 'sandra');
    await page.getByRole('link', { name: /Lee Mei Ling.*Draft plan ready/ }).click();
    await expect(page.getByRole('heading', { name: 'Lee Mei Ling' })).toBeVisible();
    await expect(page.getByText('Watch a colleague’s story time')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm this plan' }).click();
    await expect(page.getByText(/Active goals and trajectories/)).toBeVisible();
    await expect(page.getByText('No confirmed plan yet.')).toHaveCount(0);

    await signInAs(page, 'meiling', 'zh');
    await page.goto('/zh/growth');
    await expect(page.getByRole('heading', { name: '我的目标' })).toBeVisible();
    await expect(page.getByText(/由你和中心领导确认/)).toBeVisible();
  });
});

test.describe('Day 3a · educator chooses the focus', () => {
  test('Aisha picks up to 2 goals for her story-time observation @mobile', async ({ page }) => {
    await signInAs(page, 'aisha');
    await page.getByRole('link', { name: /Choose what I’d like feedback on|Change my focus/ }).click();
    await expect(page.getByRole('heading', { name: 'What would you like feedback on?' })).toBeVisible();
    const boxes = page.locator('label.tend-card');
    await expect(boxes).toHaveCount(3);
    await boxes.nth(0).click();
    await boxes.nth(1).click();
    await expect(page.getByText('2/2 chosen')).toBeVisible();
    await expect(boxes.nth(2).locator('input')).toBeDisabled(); // a third is not allowed
    await page.getByLabel(/Anything your observer should know/).fill('Trying open questions with the bear story');
    await page.getByRole('button', { name: 'Save my focus' }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByLabel('Upcoming observation').getByText('Your focus is set')).toBeVisible();
  });

  test('Aisha’s goal detail shows her trajectory and evidence', async ({ page }) => {
    await signInAs(page, 'aisha');
    await page.goto('/growth');
    await page.getByRole('link', { name: /3\.3\.4/ }).click();
    await expect(page.getByRole('heading', { name: 'Extending Thinking Through Questioning' })).toBeVisible();
    await expect(page.getByRole('img', { name: /Observed levels over time/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Evidence/ })).toBeVisible();
    await expect(page.getByText('your aim')).toBeVisible();
  });
});
