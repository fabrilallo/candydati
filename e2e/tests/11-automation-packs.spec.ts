import type { Page } from '@playwright/test';
import { expect, test } from '../support/test';
import { closeClient } from '../support/client';
import { load, open } from '../support/nav';
import { applyAs, newApplicant, workspaceWithJob } from '../support/scenario';
import { newContext } from '../support/session';

/** Local check only: `E2E_SHOTS=/some/dir` saves a screenshot of each step. */
const shot = async (page: Page, name: string): Promise<void> => {
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/${name}.png`, fullPage: true });
};

test('a pack of rules written once is attached to a job, and its rule acts on the next applicant', async ({ page, browser }) => {
  const workspace = await workspaceWithJob(page);

  // The pack: a rule on the received stage that tags every new application.
  await open(page, '/app/automations');
  await expect(page.getByTestId('packs-empty')).toBeVisible();
  await shot(page, '1-packs-empty');
  await page.getByTestId('pack-add').click();
  await page.getByTestId('pack-name').fill('Selezione tecnica');
  await page.getByTestId('pack-description').fill('Per tutte le posizioni tecniche');
  await page.getByTestId('pack-save').click();
  await page.waitForURL(/\/app\/automations\/[^/]+$/);
  await expect(page.getByTestId('pack-rules-empty')).toBeVisible();
  await page.getByTestId('pack-rule-add').click();
  await page.getByTestId('pack-rule-stage').selectOption('received');
  await page.getByTestId('rule-action').selectOption('add_tag');
  await page.getByTestId('rule-tag').fill('da-pacchetto');
  await shot(page, '2-pack-rule-dialog');
  await page.getByTestId('pack-rule-save').click();
  await expect(page.getByTestId('pack-anchor')).toContainText('Fase Ricevute');
  await expect(page.getByTestId('rule-sentence')).toContainText('da-pacchetto');
  await shot(page, '3-pack-page');

  // Attached to the job: the rule shows there, marked as coming from the pack.
  await open(page, `/app/jobs/${workspace.job.id}/automations`);
  await page.getByTestId('attach-pack').click();
  await page.getByTestId('attach-pack-select').selectOption({ label: 'Selezione tecnica' });
  await page.getByTestId('attach-pack-submit').click();
  const copied = page.locator('[data-testid="automation-stage"][data-stage-id="received"] [data-testid="automation-rule"]');
  await expect(copied.getByTestId('rule-pack')).toHaveText('Dal pacchetto Selezione tecnica');
  await shot(page, '4-job-automations');

  // A candidate applies: the copied rule tags the application.
  const applicant = newApplicant();
  const visitor = await newContext(browser);
  try {
    await applyAs(visitor.page, workspace, applicant);
  } finally {
    await closeClient(visitor.context);
  }
  await expect(async () => {
    await load(page, `/app/candidates?tag=da-pacchetto`);
    await expect(page.getByText(applicant.lastName)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
});
