import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../support/test';
import { load, open } from '../support/nav';
import { applyAs, newApplicant, workspaceWithJob } from '../support/scenario';
import { closeClient } from '../support/client';
import { newContext } from '../support/session';

/** Card menu: open with Enter, walk to "move to", open the submenu, choose another stage. Focus must stay on the board. */
const moveWithCardMenu = async (page: Page, card: Locator): Promise<void> => {
  const column = page.getByTestId('pipeline-column');
  const menu = card.getByTestId('card-menu');
  await menu.focus();
  await expect(menu).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.getByTestId('card-move').focus();
  await page.keyboard.press('ArrowRight');
  const target = page.locator('[data-testid^="move-to-"]:not([aria-disabled="true"]):not([data-disabled])').first();
  await expect(target).toBeVisible();
  await target.focus();
  await page.keyboard.press('Enter');
  await expect(column.first().getByTestId('candidate-card')).toHaveCount(0);
  // After the move the page keeps a focus target, it does not fall back to the page start.
  await expect(page.locator('body')).not.toBeFocused();
};

/** The main flows with the keyboard only: no mouse click on the controls under test. */
test('pipeline move through the card menu, candidate tabs and dialogs work from the keyboard', async ({ page, browser }) => {
  const workspace = await workspaceWithJob(page);
  const applicant = newApplicant('kbd');
  const visitor = await newContext(browser);
  try {
    await applyAs(visitor.page, workspace, applicant);
  } finally {
    await closeClient(visitor.context);
  }

  await load(page, `/app/jobs/${workspace.job.id}/candidates`);
  const card = page.getByTestId('candidate-card').filter({ hasText: applicant.lastName });
  await expect(card).toBeVisible();
  expect(await page.getByTestId('pipeline-column').first().getByTestId('candidate-card').count()).toBe(1);

  await moveWithCardMenu(page, card);

  // Candidate sheet: opened with Enter on the name, tabs reachable with the arrow keys, Escape closes and focus returns.
  const name = page.getByTestId('candidate-card').filter({ hasText: applicant.lastName }).getByTestId('card-name');
  await name.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  const tabs = page.getByRole('dialog').locator('[data-testid^="tab-"]');
  await tabs.first().focus();
  await page.keyboard.press('Tab');
  await expect(tabs.nth(1)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(name).toBeFocused();

  // Decision dialog from the detail page: menu, item, confirm with the keyboard, focus does not get lost.
  await open(page, '/app/candidates');
  await page.locator('a[href^="/app/candidates/"]').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('candidate-name')).toBeVisible();
  const decide = page.getByTestId('decide-menu');
  await decide.focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('detail-decide-not_selected').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(decide).toBeFocused();
});

test('the application form is completed and submitted with the keyboard', async ({ page, browser }) => {
  const workspace = await workspaceWithJob(page);
  const visitor = await newContext(browser);
  const applicant = newApplicant('kbd-apply');
  try {
    const p = visitor.page;
    await load(p, `/careers/${workspace.org.slug}/${workspace.job.slug}`);
    await p.getByTestId('apply-cta').focus();
    await p.keyboard.press('Enter');
    await expect(p.locator('#apply-first-name')).toBeVisible();
    await p.locator('#apply-first-name').focus();
    await p.keyboard.type(applicant.firstName);
    await p.keyboard.press('Tab');
    await p.keyboard.type(applicant.lastName);
    await p.keyboard.press('Tab');
    await p.keyboard.type(applicant.email);
    // The consent boxes toggle with Space.
    for (const id of ['consent-selection', 'consent-pool']) {
      await p.getByTestId(id).focus();
      await p.keyboard.press('Space');
      await expect(p.getByTestId(id)).toBeChecked();
    }
    // Submitting without a CV is refused: the error is in words and focus goes to the CV button, which the error describes.
    await p.getByTestId('apply-submit').focus();
    await p.keyboard.press('Enter');
    await expect(p.getByTestId('field-error')).toBeVisible();
    await expect(p.getByTestId('cv-choose')).toBeFocused();
  } finally {
    await closeClient(visitor.context);
  }
});

test('focus is visible on the controls a keyboard user lands on', async ({ page }) => {
  await load(page, '/login');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: /Vai al contenuto/ });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  for (const selector of ['#email', '#password', 'form button[type=submit]']) {
    await page.locator(selector).focus();
    const shadow = await page.locator(selector).evaluate((el) => {
      const style = getComputedStyle(el);
      return `${style.boxShadow}|${style.outlineStyle}|${style.borderColor}`;
    });
    expect(shadow, `focus indicator of ${selector}`).not.toMatch(/^none\|none\|/);
  }
});
