import type { Page } from '@playwright/test';
import { expect, test } from '../support/test';
import { closeClient } from '../support/client';
import { PASSWORD } from '../support/env';
import { createPublishedJob } from '../support/jobs';
import { load, open } from '../support/nav';
import { applyAs, newApplicant, workspaceWithJob } from '../support/scenario';
import { applyToJob } from '../support/apply';
import { invitationLink, newContext, signUp } from '../support/session';
import { identity, token } from '../support/unique';

/** The id of the candidate called `lastName`, read through the owner's session (the web proxies /api). */
const candidateIdOf = async (page: Page, lastName: string): Promise<string> => {
  const reply = await page.request.get(`/api/v1/candidates?query=${encodeURIComponent(lastName)}`);
  const body = (await reply.json()) as { data: { id: string }[] };
  const id = body.data[0]?.id;
  if (!id) throw new Error(`no candidate ${lastName}`);
  return id;
};

test('an interviewer on the team of job A opens its candidates and cannot open a candidate of job B', async ({ page, browser }) => {
  const workspace = await workspaceWithJob(page);
  const jobB = await createPublishedJob(page, { title: `Secret role ${token()} (m/f/x)` });
  const [onA, onB] = [newApplicant('team-a'), newApplicant('team-b')];
  const visitor = await newContext(browser);
  try {
    await applyAs(visitor.page, workspace, onA);
    await applyToJob(visitor.page, workspace.org.slug, jobB.slug, onB);
  } finally {
    await closeClient(visitor.context);
  }
  const [candidateA, candidateB] = [await candidateIdOf(page, onA.lastName), await candidateIdOf(page, onB.lastName)];

  // The owner invites an interviewer and puts them on the team of job A from its Team tab.
  const interviewer = identity('interviewer', PASSWORD);
  await open(page, '/app/settings/members');
  await page.locator('#invite-email').fill(interviewer.email);
  await page.locator('#invite-role').selectOption('interviewer');
  await page.getByTestId('invite-form').locator('button[type=submit]').click();
  await expect(page.getByTestId('pending-invitation').filter({ hasText: interviewer.email })).toBeVisible();
  const link = await invitationLink(page, interviewer.email);

  const second = await newContext(browser);
  try {
    await signUp(second.page, interviewer);
    await open(second.page, link);
    await second.page.getByRole('button', { name: /accetta/i }).click();
    await second.page.waitForURL(/\/app(\/|$)/);

    await open(page, `/app/jobs/${workspace.job.id}/team`);
    await page.getByTestId('team-member-select').selectOption({ label: interviewer.name });
    await page.getByTestId('team-role-select').selectOption('interviewer');
    await page.getByTestId('team-add-submit').click();
    await expect(page.getByTestId('team-member-row').filter({ hasText: interviewer.name })).toBeVisible();

    // Job A: the candidate opens. Job B: the ad is not in the list and its candidate is "not accessible".
    await load(second.page, `/app/candidates/${candidateA}`);
    await expect(second.page.getByTestId('candidate-name')).toContainText(onA.lastName);
    await open(second.page, `/app/candidates/${candidateB}`);
    await expect(second.page.getByTestId('not-accessible')).toBeVisible();
    await expect(second.page.getByText(onB.lastName)).toHaveCount(0);
    await open(second.page, '/app/jobs');
    await expect(second.page.locator('#main').getByText(workspace.job.title)).toBeVisible();
    await expect(second.page.locator('#main').getByText(jobB.title)).toHaveCount(0);
  } finally {
    await closeClient(second.context);
  }
});
