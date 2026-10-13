import { expect, test } from '../support/test';
import { load } from '../support/nav';
import { waitForMail } from '../support/mailpit';
import { applyAs, newApplicant, workspaceWithJob } from '../support/scenario';
import { closeClient } from '../support/client';
import { newContext } from '../support/session';
import { token } from '../support/unique';

test('a candidate applies and the recruiter moves, writes to and decides on the application', async ({ page, browser }) => {
  const workspace = await workspaceWithJob(page);
  const applicant = newApplicant();

  const visitor = await newContext(browser);
  try {
    await applyAs(visitor.page, workspace, applicant);
    await expect(visitor.page.getByTestId('apply-commitment')).toBeVisible();
  } finally {
    await closeClient(visitor.context);
  }

  const receipt = await waitForMail(applicant.email);
  expect(`${receipt.Text}${receipt.HTML}`).toContain(workspace.job.title);

  // Pipeline, loaded fresh as a person would after the notification: the card is in the first stage.
  await load(page, `/app/jobs/${workspace.job.id}/candidates`);
  const card = page.getByTestId('candidate-card').filter({ hasText: applicant.lastName });
  await expect(card).toBeVisible();
  await expect(page.getByTestId('pipeline-summary')).toContainText('1');

  await card.getByTestId('card-name').click();
  await expect(page.getByTestId('candidate-name')).toContainText(applicant.lastName);
  await expect(page.getByTestId('candidate-stage')).toBeVisible();
  const stageBefore = await page.getByTestId('candidate-stage').innerText();

  // Move to another stage.
  await page.getByTestId('move-menu').click();
  await page.locator('[data-testid^="detail-move-"]').first().click();
  await expect(page.getByTestId('candidate-stage')).not.toHaveText(stageBefore);

  // Message: arrives in Mailpit, to the candidate.
  const subject = `Aggiornamento ${token()}`;
  await page.getByTestId('tab-messages').click();
  await page.getByTestId('composer-subject').fill(subject);
  await page.getByTestId('composer-body').fill('Ciao, ti scriviamo per fissare un colloquio. A presto.');
  await page.getByTestId('composer-send').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Invia', exact: true }).click();
  const sent = await waitForMail(applicant.email, { subject: new RegExp(subject) });
  expect(sent.Text).toContain('fissare un colloquio');

  // Outcome.
  await page.getByTestId('decide-menu').click();
  await page.getByTestId('detail-decide-not_selected').click();
  await page.getByRole('dialog').getByRole('button', { name: "Registra l'esito" }).click();
  await expect(page.getByTestId('candidate-status')).toContainText('Non selezionata');
  await expect(page.getByTestId('decide-menu')).toHaveCount(0);
});
