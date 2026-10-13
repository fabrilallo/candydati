import { devices } from '@playwright/test';
import { expect, test } from '../support/test';
import { closeClient, isolateClient } from '../support/client';
import { load, open } from '../support/nav';
import { linkIn, waitForMail } from '../support/mailpit';
import { applyAs, newApplicant, workspaceWithJob } from '../support/scenario';
import { newContext } from '../support/session';
import { identity } from '../support/unique';
import { PASSWORD } from '../support/env';

test('an external interviewer leaves feedback from a phone, without an account, and the recruiter reads it', async ({ page, browser }) => {
  const workspace = await workspaceWithJob(page);
  const interviewer = identity('interviewer', PASSWORD);
  const applicant = newApplicant();

  // The external interviewer is set on the second stage of the process (technical interview).
  await open(page, `/app/jobs/${workspace.job.id}`);
  await page.getByTestId('job-field-process-1-interviewers-add').click();
  await page.getByTestId('interviewer-external').click();
  await page.getByLabel('Nome', { exact: false }).last().fill(interviewer.name);
  await page.locator('#job-field-process-1-interviewers-ext-email').fill(interviewer.email);
  await page.getByTestId('external-add').click();
  await expect(page.getByTestId('interviewer-chip').filter({ hasText: interviewer.name })).toBeVisible();

  // A candidate applies; moving them to that stage asks the interviewer for feedback.
  const visitor = await newContext(browser);
  try {
    await applyAs(visitor.page, workspace, applicant);
  } finally {
    await closeClient(visitor.context);
  }
  await load(page, `/app/jobs/${workspace.job.id}/candidates`);
  await page.getByTestId('candidate-card').filter({ hasText: applicant.lastName }).getByTestId('card-name').click();
  await expect(page.getByTestId('candidate-name')).toContainText(applicant.lastName);
  await page.getByTestId('move-menu').click();
  await page.getByRole('menuitem', { name: 'Colloquio tecnico' }).click();
  await expect(page.getByTestId('candidate-stage')).toContainText('Colloquio tecnico');

  const mail = await waitForMail(interviewer.email);
  const link = linkIn(mail, /\/feedback\//);

  // A fresh browser context on a phone, with no session at all.
  const phone = await browser.newContext({ ...devices['Pixel 7'], locale: 'it-IT' });
  await isolateClient(phone);
  try {
    const mobile = await phone.newPage();
    await load(mobile, new URL(link).pathname);
    await expect(mobile.getByTestId('feedback-page')).toBeVisible();
    await expect(mobile.getByTestId('feedback-page')).toContainText(applicant.lastName);
    const fitsScreen = await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(fitsScreen).toBe(true);

    const answers = mobile.locator('[data-testid^="answer-"]');
    const count = await answers.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) await answers.nth(index).fill(`Risposta ${index + 1}: ottimo livello tecnico.`);
    await mobile.getByTestId('recommendation-proceed').click();
    await mobile.getByTestId('feedback-submit').click();
    await expect(mobile.getByTestId('feedback-done')).toBeVisible();

    // The link is single use.
    await load(mobile, new URL(link).pathname);
    await expect(mobile.getByTestId('feedback-failure')).toBeVisible();
  } finally {
    await closeClient(phone);
  }

  // The recruiter sees it on the candidate.
  await page.getByTestId('tab-feedback').click();
  await expect(page.getByTestId('feedback-group-submitted')).toContainText('Risposta 1');
});
