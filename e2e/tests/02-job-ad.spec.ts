import { expect, test } from '../support/test';
import { load, open } from '../support/nav';
import { closeClient } from '../support/client';
import { newContext, newWorkspace } from '../support/session';
import { publishPrivacyNotice } from '../support/privacy';
import { fillJob, publishOpenJob, publishedSlug, saveDraft } from '../support/jobs';
import { token } from '../support/unique';

test('publishing is blocked until the ad is complete and lawful, then it shows on the public pages and in the feed', async ({ page, request, browser }) => {
  const { owner, org } = await newWorkspace(page);
  await publishPrivacyNotice(page, owner.email);
  const title = `Backend Developer ${token()} (m/f/x)`;

  // Missing salary max: the form is saved as a draft but cannot be published.
  await open(page, '/app/jobs/new');
  await fillJob(page, { title }, ['salary.max']);
  const jobId = await saveDraft(page);
  // Saving a new ad moves the editor to the ad's own address: come back to it so the next edits land on the settled page.
  await open(page, '/app/jobs');
  await open(page, `/app/jobs/${jobId}`);
  await expect(page.getByTestId('publish')).toBeDisabled();
  await expect(page.locator('#job-field-title')).toHaveValue(title);
  await page.locator('#job-field-salary-max').fill('60000');
  await expect(page.locator('#job-field-salary-max')).toHaveValue('60.000');
  await page.getByTestId('save').click();
  await expect(page.getByTestId('publish')).toBeEnabled();

  // A title for one sex only is blocked by the compliance check, with its reason on screen.
  await page.locator('#job-field-title').fill(`Cameriera di sala ${token()}`);
  await expect(page.getByTestId('compliance-blocking')).toBeVisible();
  await expect(page.getByTestId('publish')).toBeDisabled();
  await page.locator('#job-field-title').fill(title);
  await expect(page.getByTestId('compliance-blocking')).toHaveCount(0);

  await page.getByTestId('save').click();
  await expect(page.getByTestId('save')).toBeEnabled();
  await publishOpenJob(page);
  const jobSlug = await publishedSlug(page);
  expect(jobSlug).not.toBe('');
  await page.getByRole('button', { name: 'Fatto' }).click();
  expect(jobId).not.toBe('');

  // Public careers page and ad page: a visitor with no session, RAL and process in clear.
  const visitor = await newContext(browser);
  const pub = visitor.page;
  await load(pub, `/careers/${org.slug}`);
  const card = pub.getByTestId('careers-job').filter({ hasText: title });
  await expect(card).toBeVisible();
  await expect(card.getByTestId('careers-salary')).toContainText(/45\.000/);
  await expect(card.getByTestId('careers-salary')).toContainText(/60\.000/);
  await expect(card.getByTestId('careers-process')).toBeVisible();

  await card.getByRole('link', { name: title }).click();
  await expect(pub.getByTestId('ad-title')).toContainText(title);
  await expect(pub.getByTestId('job-facts')).toContainText(/45\.000/);
  await expect(pub.getByTestId('job-facts')).toContainText(/60\.000/);
  await expect(pub.getByTestId('job-stage')).toHaveCount(2);
  await expect(pub.getByTestId('job-response-time')).toBeVisible();
  await expect(pub.getByTestId('apply-cta')).toBeVisible();
  await closeClient(visitor.context);

  // The XML feed (plain http, no cookies) carries the ad.
  const feed = await request.get(`/careers/${org.slug}/jobs.xml`);
  expect(feed.ok()).toBe(true);
  const xml = await feed.text();
  expect(xml).toContain(title);
  expect(xml).toContain(jobSlug);
});
