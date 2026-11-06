import type { Page } from '@playwright/test';
import { expect, test } from '../support/test';
import { closeClient } from '../support/client';
import { load, open } from '../support/nav';
import { workspaceWithJob } from '../support/scenario';
import { newContext } from '../support/session';

/** Local check only: `E2E_SHOTS=/some/dir` saves a screenshot of each step. */
const shot = async (page: Page, name: string): Promise<void> => {
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/${name}.png`, fullPage: true });
};

test('a person found on LinkedIn becomes a contact, gets the notice in the first message, and erases their data from the link', async ({ page, browser }) => {
  const workspace = await workspaceWithJob(page);
  await open(page, `/app/jobs/${workspace.job.id}/sourcing`);
  await expect(page.getByTestId('sourcing-empty')).toBeVisible();

  await page.getByTestId('contact-add').click();
  await page.getByTestId('contact-first-name').fill('Maja');
  await page.getByTestId('contact-profile-url').fill(`https://www.linkedin.com/in/maja-${workspace.job.id.slice(0, 8)}`);
  await page.getByTestId('contact-evidence-input').fill('Go: 4 anni in Spotify');
  await shot(page, '1-add-contact');
  await page.getByTestId('add-contact-save').click();
  await expect(page.getByTestId('contact-name')).toHaveText('Maja');
  await expect(page.getByTestId('contact-evidence')).toContainText('Go: 4 anni in Spotify');
  await expect(page.getByTestId('contact-expiry')).toContainText('30 giorni');
  await shot(page, '2-contacts');

  await page.getByTestId('contact-notice').click();
  const text = page.getByTestId('notice-text');
  await expect(text).toHaveValue(/\/sourcing\/notice\//);
  await shot(page, '3-notice');
  const link = /(https?:\/\/\S+\/sourcing\/notice\/\S+)/.exec(await text.inputValue())?.[1] ?? '';
  await page.getByTestId('notice-contacted').click();
  await expect(page.getByTestId('contact-status')).toHaveText('Contattato');

  // The person opens the link, without any account.
  const visitor = await newContext(browser);
  try {
    await load(visitor.page, new URL(link).pathname);
    await expect(visitor.page.getByTestId('sourcing-notice-data')).toContainText('Maja');
    await shot(visitor.page, '4-public-notice');
    await visitor.page.getByTestId('sourcing-notice-erase').click();
    await expect(visitor.page.getByTestId('sourcing-notice-erased')).toBeVisible();
  } finally {
    await closeClient(visitor.context);
  }
  await load(page, `/app/jobs/${workspace.job.id}/sourcing`);
  await expect(page.getByTestId('sourcing-empty')).toBeVisible();
});
