import { expect, test } from '@playwright/test';
import { axe, clickUntilUrl, expectNoHorizontalScroll, signInAs } from './helpers';


test.describe.serial('Day 5–6 · Coach, Reflect, Learn, Insights, Metrics, HQ, Admin', () => {
  test('Coach answers from Aisha’s own plan, shows the transparency banner, handles distress with care @mobile', async ({ page }) => {
    await signInAs(page, 'aisha');
    await page.goto('/coach');
    await expect(page.getByRole('note').filter({ hasText: 'Your Centre Leader can see themes from your chats' })).toBeVisible();
    await page.getByRole('button', { name: 'My K1s go quiet when I ask open questions' }).click();
    const conv = page.getByRole('region', { name: 'Conversation' });
    await expect(conv.getByText('goal 3.3.4', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(conv).toContainText(/Quiet moments are common/);
    await page.getByLabel('Message to Coach').fill('Honestly I am so overwhelmed, I can’t cope');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(conv).toContainText('Samaritans of Singapore', { timeout: 20_000 });
    await page.getByRole('button', { name: 'Save as reflection' }).first().click();
    await expect(page.getByText('Saved to your private journal')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await axe(page);
  });

  test('Reflect journal: private by default', async ({ page }) => {
    await signInAs(page, 'aisha');
    await page.goto('/reflect');
    await page.getByLabel('New reflection').fill('A private thought about story time.');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('A private thought about story time.')).toBeVisible();
    await expect(page.locator('li', { hasText: 'A private thought' })).toContainText('Private');
    await axe(page);
  });

  test('Learn: Peer Match first with reasons; Aisha proposes, Sandra endorses', async ({ page }) => {
    await signInAs(page, 'aisha');
    await page.goto('/learn');
    const first = page.locator('ol > li.tend-card').first();
    await expect(first).toContainText('Watch Farah Ismail for 15 minutes');
    await expect(first).toContainText('Matches your goal 3.3.4');
    await expect(page.getByText(/CPD this year/)).toBeVisible();
    const course = page.locator('ol > li.tend-card', { hasText: 'Questioning Techniques' }).first();
    await course.getByRole('button', { name: 'Add to my plan' }).click();
    await expect(course.getByText('In your plan')).toBeVisible();
    await axe(page);

    await signInAs(page, 'sandra');
    // Today's "Needs you" queue lists the item waiting for endorsement (PRD M7.1)
    await expect(page.getByRole('link', { name: /Aisha binte Rahman.*added to their plan/ })).toBeVisible();
    await page.goto('/educators');
    // regression: the list must show all 15 Punggol educators (a bad embed once returned none)
    await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(15);
    await clickUntilUrl(page, page.getByRole('link', { name: /Aisha binte Rahman/ }), /\/educators\/[0-9a-f-]{36}$/);
    const proposed = page.getByRole('region', { name: /Proposed learning/ });
    await expect(proposed).toContainText('Questioning Techniques');
    await proposed.getByRole('button', { name: 'Endorse' }).first().click();
    await expect(page.getByText('Endorsed')).toBeVisible();
    // coach THEMES (never the chat) are visible to the leader
    await expect(page.getByRole('region', { name: /Coach themes/ })).toContainText('Goal 3.3.4');
    await expect(page.getByRole('region', { name: /Coach themes/ })).not.toContainText('overwhelmed');

    // drill-down is two deliberate steps, and opening a conversation is logged for the educator (PRD M5.7)
    const themes = page.getByRole('region', { name: /Coach themes/ });
    await themes.getByRole('button', { name: 'Conversation details' }).click();
    await expect(themes.getByText(/can see it under/)).toBeVisible();
    await themes.getByRole('button', { name: 'Open' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Open this conversation?' });
    await expect(dialog).toBeVisible();
    await axe(page);
    await page.getByRole('button', { name: 'Open and log it' }).click();
    await expect(themes.getByRole('list', { name: /Conversation of/ })).toContainText('Aisha');
    await signInAs(page, 'aisha');
    await page.goto('/preferences');
    await expect(page.getByRole('region', { name: 'Who accessed your records' })).toContainText('viewed in detail · coach conversation');
  });

  test('Insights: heatmap, drill-down, blind spots, learning group', async ({ page }) => {
    await signInAs(page, 'sandra');
    await page.goto('/insights');
    const table = page.getByRole('table');
    await expect(table.getByRole('rowheader')).toHaveCount(13); // preschool educators
    await expect(page.getByText(/3\.4 Self-Regulation and Executive Function — \d+ of 13 educators growing/)).toBeVisible();
    await expect(page.getByText(/2\.1\.3 Encouraging Awareness/)).toBeVisible();
    await clickUntilUrl(page, page.getByRole('link', { name: /^3\.4/ }).first(), /sd=3\.4/);
    await expect(page.getByRole('columnheader', { name: '3.4.2' })).toBeVisible();
    await page.goto('/insights');
    await page.getByRole('button', { name: 'Build this learning group' }).first().click();
    await expect(page.getByText('Learning group created')).toBeVisible();
    await axe(page);
  });

  test('Sandbox Metrics: 7 KPIs with "how measured" and a CSV export', async ({ page }) => {
    await signInAs(page, 'sandra');
    await page.goto('/metrics');
    await expect(page.locator('ul > li.tend-card')).toHaveCount(7);
    await expect(page.getByText('Transcription accuracy')).toBeVisible();
    const href = await page.getByRole('link', { name: 'Export CSV' }).getAttribute('href');
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    const csv = await res.text();
    expect(csv.split('\n')[0]).toBe('metric,value,target,met,how_measured,scope,generated_at');
    expect(csv.trim().split('\n')).toHaveLength(8);
    await axe(page);
  });

  test('Leader schedules an observation; the educator is told', async ({ page }) => {
    await signInAs(page, 'sandra');
    await page.goto('/observe');
    // Farah, not Ravi: an upcoming observation hides Ravi's "ask your leader" card that 07-request tests.
    await page.getByLabel('Educator').selectOption({ label: 'Farah Ismail' });
    await page.getByLabel('Activity').fill('Block play');
    await page.getByLabel('When (Singapore time)').fill('2026-12-01T10:00');
    await page.getByRole('button', { name: 'Schedule' }).click();
    await expect(page.getByText(/Scheduled/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Farah Ismail · Block play/ })).toBeVisible();
    await signInAs(page, 'farah');
    await expect(page.getByText('Block play')).toBeVisible();
  });

  test('HQ: network heatmap (groups ≥ 5), registry with 46 QTT indicators, programmes', async ({ page }) => {
    await signInAs(page, 'daniel');
    await expect(page.getByRole('heading', { name: 'Network', exact: true })).toBeVisible();
    await expect(page.getByRole('rowheader')).toHaveCount(3);
    await page.goto('/registry?fw=QTT');
    await expect(page.getByText(/46$/).first()).toBeVisible();
    await page.goto('/programmes');
    // the catalogue is a list with Needs review / Live / Retired tabs; the 30 seeded courses are live
    await expect(page.getByRole('link', { name: /^Live\s*30$/ })).toBeVisible();
    await expect(page.locator('main ol > li')).toHaveCount(30);
    await axe(page);
  });

  test('Admin: people, invite, access log', async ({ page }) => {
    await signInAs(page, 'admin');
    await expect(page.getByRole('heading', { name: 'Users, roles and access' })).toBeVisible();
    await page.getByLabel('Full name').fill('New Educator');
    await page.getByLabel('Work email').fill(`new.educator.${Date.now()}@demo.tend.sg`);
    await page.getByLabel('Centre').selectOption({ label: 'Tampines' });
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText(/^Invited /)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel('Temporary password')).toHaveText(/^\w{4}(-\w{4}){3}$/);
    await page.getByRole('button', { name: 'Done' }).click();
    // the Person cell holds the name and the email
    await expect(page.getByRole('cell').getByText('New Educator', { exact: true })).toBeVisible();
  });

  test('Preferences: Mdm Lee keeps 130% text and can switch language; educators see who accessed their records', async ({ page }) => {
    await signInAs(page, 'meiling', 'zh');
    await page.goto('/zh/preferences');
    await expect(page.getByRole('button', { name: '130%' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: '谁查看了你的记录' })).toBeVisible();
    await page.getByRole('button', { name: 'English' }).click();
    await page.getByRole('button', { name: '保存偏好设置' }).click();
    await expect(page).toHaveURL(/\/preferences$/);
    await expect(page.getByRole('heading', { name: 'Who accessed your records' })).toBeVisible(); // now in English
    // put her back to Chinese: later specs (07-request) use Mdm Lee as the Chinese-speaking persona
    await page.getByRole('button', { name: '中文' }).click();
    await page.getByRole('button', { name: 'Save preferences' }).click();
    await expect(page).toHaveURL(/\/zh\/preferences$/, { timeout: 20_000 });
  });
});
