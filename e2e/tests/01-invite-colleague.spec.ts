import { expect, test } from '../support/test';
import { closeClient } from '../support/client';
import { PASSWORD } from '../support/env';
import { identity } from '../support/unique';
import { open } from '../support/nav';
import { invitationLink, newContext, newWorkspace, signUp } from '../support/session';

test('owner invites a recruiter, who accepts and sees the members page, then changes their role', async ({ page, browser }) => {
  const { org, owner } = await newWorkspace(page);

  await open(page, '/app/settings/members');
  await expect(page.getByRole('heading', { name: 'Membri', level: 1 })).toBeVisible();
  const colleague = identity('recruiter', PASSWORD);
  await page.locator('#invite-email').fill(colleague.email);
  await page.locator('#invite-role').selectOption('recruiter');
  await page.getByTestId('invite-form').locator('button[type=submit]').click();
  const pending = page.getByTestId('pending-invitation').filter({ hasText: colleague.email });
  await expect(pending).toBeVisible();

  const link = await invitationLink(page, colleague.email);
  const second = await newContext(browser);
  try {
    await signUp(second.page, colleague);
    await open(second.page, link);
    await expect(second.page.getByRole('heading', { level: 1 })).toContainText(org.name);
    await expect(second.page.getByText(owner.email)).toBeVisible();
    await second.page.getByRole('button', { name: /accetta/i }).click();
    await second.page.waitForURL(/\/app(\/|$)/);

    await open(second.page, '/app/settings/members');
    await expect(second.page.getByRole('heading', { name: 'Membri', level: 1 })).toBeVisible();
    const main = second.page.locator('#main');
    await expect(main.getByText(owner.email)).toBeVisible();
    await expect(main.getByText(colleague.email)).toBeVisible();
  } finally {
    await closeClient(second.context);
  }

  await page.reload();
  await expect(page.getByTestId('pending-invitation')).toHaveCount(0);

  const row = page.getByTestId('member-row').filter({ hasText: colleague.email });
  await row.getByRole('combobox').selectOption('hiring_manager');
  await expect(row.getByRole('combobox')).toHaveValue('hiring_manager');
  await page.reload();
  await expect(page.getByTestId('member-row').filter({ hasText: colleague.email }).getByRole('combobox')).toHaveValue('hiring_manager');
  await expect(page.getByTestId('member-row').filter({ hasText: owner.email }).getByRole('combobox')).toHaveCount(0);
});
