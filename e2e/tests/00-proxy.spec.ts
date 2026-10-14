import { expect, test } from '@playwright/test';
import { PASSWORD } from '../support/env';
import { load } from '../support/nav';
import { logIn, signUp } from '../support/session';
import { identity } from '../support/unique';

/**
 * Every other spec sends `/api/**` straight to the api (see support/client.ts). This one does not: the browser talks
 * only to the web origin, so POST bodies, 401 answers and cookies go through the real web proxy (server/lib/api-proxy.ts),
 * exactly as in production.
 */
test('sign-up, a refused sign-in (401) and a sign-in work through the web proxy', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'it-IT' });
  try {
    const page = await context.newPage();
    const who = identity('proxy', PASSWORD);
    await signUp(page, who);
    await context.clearCookies();

    await load(page, '/login');
    await page.locator('#email').fill(who.email);
    await page.locator('#password').fill('Wrong-Password-1234');
    await page.locator('form button[type=submit]').click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await logIn(page, who);
    await expect(page).toHaveURL(/\/(onboarding|app)/);
  } finally {
    await context.close();
  }
});
