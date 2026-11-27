import { expect, test, type Browser, type Page } from '@playwright/test';
import { axe, signInAs } from './helpers';

/** Email + password sign-in: admin-issued temporary passwords, forced change, admin reset, self-service change. */
test.describe.serial('Sign-in · email and password', () => {
  const email = `pw.tester.${Date.now()}@example.org`;
  const name = 'Pat Password';
  let temp = '';
  const mine = 'garden snails are slow 7';
  const mine2 = 'paper boats on the river 9';

  async function freshPage(browser: Browser) {
    const ctx = await browser.newContext();
    return ctx.newPage();
  }

  async function signInWithPassword(page: Page, password: string, path = '/login') {
    await page.goto(path);
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('form').filter({ has: page.locator('#password') }).getByRole('button').click();
  }

  test('admin creates an account and gets a one-time temporary password', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.getByLabel('Full name').fill(name);
    await page.getByLabel('Work email').fill(email);
    await page.getByLabel('Centre').selectOption({ label: 'Tampines' });
    await page.getByRole('button', { name: 'Create account' }).click();
    const code = page.getByLabel('Temporary password');
    await expect(code).toHaveText(/^\w{4}(-\w{4}){3}$/, { timeout: 20_000 });
    temp = (await code.textContent())!.trim();
    await axe(page);
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByLabel('Temporary password')).toHaveCount(0);
    await expect(page.getByRole('cell').getByText(name, { exact: true })).toBeVisible(); // the Person cell holds name + email
  });

  test('a wrong password is refused with one neutral message @mobile', async ({ browser }) => {
    const page = await freshPage(browser);
    await signInWithPassword(page, 'not the password');
    await expect(page.locator('form [role=alert]')).toHaveText('That email and password don’t match. Please try again.');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('#email')).toHaveValue(email); // email kept, password cleared
    // unknown email gets the same message (no account enumeration)
    await page.locator('#email').fill('nobody.here@example.org');
    await page.locator('#password').fill('whatever123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('form [role=alert]')).toHaveText('That email and password don’t match. Please try again.');
  });

  test('first sign-in with the temporary password must choose a new one before anything else', async ({ browser }) => {
    const page = await freshPage(browser);
    await signInWithPassword(page, temp);
    await expect(page).toHaveURL(/\/change-password$/);
    await expect(page.getByRole('heading', { name: 'Choose your password' })).toBeVisible();
    await expect(page.locator('#current')).toHaveCount(0); // not asked again: they just typed it
    await axe(page);

    // cannot skip it
    await page.goto('/home');
    await expect(page).toHaveURL(/\/change-password$/);

    // validation
    await page.locator('#password').fill('short');
    await page.locator('#confirm').fill('short');
    await page.locator('#password').evaluate((el) => el.removeAttribute('minlength')); // test the server check
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page.locator('form [role=alert]')).toHaveText('Use at least 10 characters.');
    await page.locator('#password').fill(mine);
    await page.locator('#confirm').fill(`${mine}x`);
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page.locator('form [role=alert]')).toHaveText('The two new passwords don’t match.');

    await page.locator('#password').fill(mine);
    await page.locator('#confirm').fill(mine);
    await page.getByRole('button', { name: 'Save password' }).click();

    // then first-login onboarding (PRD M1): language → text size → intro → role → AI notice
    await expect(page).toHaveURL(/\/onboarding$/, { timeout: 20_000 });
    await page.goto('/home');
    await expect(page).toHaveURL(/\/onboarding$/); // cannot skip it either
    await expect(page.getByRole('heading', { name: 'Welcome to Tend, Pat' })).toBeVisible();
    await axe(page);
    await page.getByRole('button', { name: 'English' }).click();
    await page.getByRole('radio', { name: '115%' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Growth, not grading' })).toBeVisible();
    await page.getByRole('button', { name: 'Skip intro' }).click();
    await expect(page.getByText('You are joining Tend as Educator at Tampines.')).toBeVisible();
    await page.getByRole('button', { name: 'Yes, that’s me' }).click();
    const start = page.getByRole('button', { name: 'Start using Tend' });
    await expect(start).toBeDisabled();
    await axe(page);
    await page.getByLabel('I have read how Tend uses AI and my data.').check();
    await start.click();
    await expect(page).toHaveURL(/\/growth\/needs-analysis$/, { timeout: 20_000 });
    await expect(page.locator('html')).toHaveAttribute('style', /--text-scale:\s*115/);
  });

  test('the new password works; the temporary one no longer does', async ({ browser }) => {
    const page = await freshPage(browser);
    await signInWithPassword(page, temp);
    await expect(page.locator('form [role=alert]')).toBeVisible();
    await signInWithPassword(page, mine);
    await expect(page).toHaveURL(/\/home$/, { timeout: 20_000 });
  });

  test('signing in keeps the page they were heading to', async ({ browser }) => {
    const page = await freshPage(browser);
    await page.goto('/reflect');
    await expect(page).toHaveURL(/\/login\?next=%2Freflect/);
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(mine);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/reflect$/, { timeout: 20_000 });
  });

  test('changing your own password from Preferences asks for the current one', async ({ browser }) => {
    const page = await freshPage(browser);
    await signInWithPassword(page, mine);
    await expect(page).toHaveURL(/\/home$/, { timeout: 20_000 });
    await page.goto('/preferences');
    await page.getByRole('link', { name: 'Change password' }).click();
    await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible();
    await page.locator('#current').fill('wrong current pw');
    await page.locator('#password').fill(mine2);
    await page.locator('#confirm').fill(mine2);
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page.locator('form [role=alert]')).toHaveText('Your current password isn’t right.');
    await page.locator('#current').fill(mine);
    await page.locator('#password').fill(mine);
    await page.locator('#confirm').fill(mine);
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page.locator('form [role=alert]')).toHaveText('Choose a password different from your current one.');
    await page.locator('#current').fill(mine);
    await page.locator('#password').fill(mine2);
    await page.locator('#confirm').fill(mine2);
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page).toHaveURL(/\/home$/, { timeout: 20_000 });
  });

  test('admin resets a forgotten password → new temporary password, forced change again', async ({ page, browser }) => {
    await signInAs(page, 'admin');
    await page.getByRole('button', { name: `Reset password for ${name}` }).click();
    await page.getByRole('button', { name: 'Confirm reset' }).click();
    const code = page.getByLabel('Temporary password');
    await expect(code).toHaveText(/^\w{4}(-\w{4}){3}$/, { timeout: 20_000 });
    const temp2 = (await code.textContent())!.trim();
    expect(temp2).not.toBe(temp);
    await expect(page.getByRole('button', { name: `Reset password for ${name}` })).toHaveCount(0); // the row now shows the password instead
    await page.goto('/admin');
    await expect(page.getByText(/password reset · account · about Pat Password/).first()).toBeVisible();

    const user = await freshPage(browser);
    await signInWithPassword(user, mine2);
    await expect(user.locator('form [role=alert]')).toBeVisible(); // old password stopped working
    await signInWithPassword(user, temp2);
    await expect(user).toHaveURL(/\/change-password$/);
    await user.locator('#password').fill(mine);
    await user.locator('#confirm').fill(mine);
    await user.getByRole('button', { name: 'Save password' }).click();
    await expect(user).toHaveURL(/\/home$/, { timeout: 20_000 });
  });

  test('admin cannot reset their own password from the list', async ({ page }) => {
    await signInAs(page, 'admin');
    await expect(page.getByRole('button', { name: 'Reset password for Agape IT Admin' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Change mine' })).toBeVisible();
  });

  test('Chinese and Malay sign-in pages @mobile', async ({ browser }) => {
    const page = await freshPage(browser);
    await page.goto('/ms/login');
    await expect(page.getByRole('heading', { name: 'Log masuk ke Tend' })).toBeVisible();
    await expect(page.getByLabel('Kata laluan')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ms-SG');
    await axe(page);
    await page.goto('/zh/login');
    await expect(page.getByLabel('密码')).toBeVisible();
  });

  // Not @mobile: needs the account created by the earlier (desktop-only) steps.
  // The language saved in the profile wins over the sign-in page's (login/actions.ts preferredLocale).
  test('the language saved in Preferences wins at sign-in: Malay profile → Malay home', async ({ browser }) => {
    const page = await freshPage(browser);
    await signInWithPassword(page, mine);
    await expect(page).toHaveURL(/\/home$/, { timeout: 20_000 });
    await page.goto('/preferences');
    await page.getByRole('button', { name: 'Bahasa Melayu' }).click();
    await page.getByRole('button', { name: 'Save preferences' }).click();
    await expect(page).toHaveURL(/\/ms\/preferences$/, { timeout: 20_000 });

    const again = await freshPage(browser);
    await signInWithPassword(again, mine, '/login'); // English sign-in page
    await expect(again).toHaveURL(/\/ms\/home$/, { timeout: 20_000 });
    await expect(again.getByRole('navigation', { name: 'Navigasi utama' }).first()).toBeVisible();
  });
});
