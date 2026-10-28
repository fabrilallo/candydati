import type { Page } from '@playwright/test';
import { expect, test } from '../support/test';
import { applyToJob } from '../support/apply';
import { VISITOR_USER_AGENT } from '../support/browser';
import { closeClient } from '../support/client';
import { open } from '../support/nav';
import { newApplicant, workspaceWithJob } from '../support/scenario';
import { newContext } from '../support/session';

const isBeacon = (url: string, method: string): boolean => method === 'POST' && /\/jobs\/[^/]+\/view\?/.test(url);

/** The daily figures of the Distribution tab for one visit and one application, then who applied and where from. */
async function checkDistributionFigures(page: Page, jobId: string, lastName: string): Promise<void> {
  const panel = page.getByTestId('job-sources');
  await expect(panel.getByTestId('traffic-visits')).toHaveText('1');
  await expect(panel.getByTestId('traffic-applications')).toHaveText('1');
  await expect(panel.getByTestId('traffic-conversion-note')).toContainText('Servono almeno 5 visite');
  await expect(panel.getByTestId('traffic-chart').locator('svg').first()).toBeVisible();
  await expect(panel.getByTestId('source-table-row').filter({ hasText: 'LinkedIn' })).toBeVisible();

  // Choosing the source lists who applied through it; the profile says where the application came from.
  await panel.getByTestId('source-table-row').filter({ hasText: 'LinkedIn' }).getByRole('button').click();
  const person = panel.getByTestId('source-application').filter({ hasText: lastName });
  await expect(person).toHaveCount(1);
  await person.getByRole('link').click();
  await expect(page.getByTestId('candidate-origin')).toHaveText('Provenienza: LinkedIn, campagna autumn');
  await open(page, `/app/jobs/${jobId}/distribution`);
  await page.locator('#tracked-channel').selectOption('linkedin');
}

test('a tracked link brings visits and an application, and Reports show the source and campaign', async ({ page, browser }) => {
  test.setTimeout(6 * 60_000);
  const workspace = await workspaceWithJob(page);
  const applicant = newApplicant('tracked');

  const visitor = await newContext(browser, { userAgent: VISITOR_USER_AGENT });
  try {
    const beacon = visitor.page.waitForResponse((response) => isBeacon(response.url(), response.request().method()));
    await applyToJob(visitor.page, workspace.org.slug, workspace.job.slug, applicant, '?utm_source=linkedin&utm_campaign=autumn');
    const counted = await beacon;
    expect(counted.status()).toBe(204);
    expect(counted.url()).toContain('source=linkedin');
    expect(counted.url()).toContain('campaign=autumn');
    // Nothing is stored in the browser to follow the visitor: no cookie, and no web storage beyond the theme preference.
    expect(await visitor.context.cookies()).toEqual([]);
    const stored = await visitor.page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)]);
    expect(stored.filter((key) => key !== 'candydati.theme')).toEqual([]);
  } finally {
    await closeClient(visitor.context);
  }

  await open(page, '/app/reports');
  const sources = page.getByTestId('source-row');
  await expect(sources.filter({ hasText: 'linkedin' })).toContainText('1 visita');
  // One visit and one application make no rate: the card says so instead of a bare dash.
  await expect(sources.filter({ hasText: 'linkedin' })).toContainText('troppo poche per un tasso');
  await expect(page.getByTestId('campaign-row').filter({ hasText: 'linkedin / autumn' })).toContainText('1 visita');

  // The Distribution tab of the ad has the same figures day by day, next to the builder of the link.
  await open(page, `/app/jobs/${workspace.job.id}/distribution`);
  await page.locator('#tracked-channel').selectOption('linkedin');
  await page.locator('#tracked-campaign').fill('Autumn 2026');
  await expect(page.getByTestId('tracked-link-url')).toContainText(`/careers/${workspace.org.slug}/${workspace.job.slug}?utm_source=linkedin&utm_campaign=autumn-2026`);
  await checkDistributionFigures(page, workspace.job.id, applicant.lastName);

  // Saved, the link the applicant used is still there when the tab is opened again, with the application it brought.
  await page.locator('#tracked-campaign').fill('autumn');
  await page.getByTestId('tracked-link-save').click();
  await expect(page.getByTestId('tracked-link-row')).toHaveCount(1);
  await open(page, `/app/jobs/${workspace.job.id}/distribution`);
  const saved = page.getByTestId('tracked-link-row');
  await expect(saved).toHaveCount(1);
  await expect(saved.getByTestId('tracked-link-saved-url')).toContainText('?utm_source=linkedin&utm_campaign=autumn');
  await expect(saved.getByTestId('tracked-link-applications')).toContainText('1 candidatura');
  await saved.getByTestId('tracked-link-people').locator('summary').click();
  await expect(saved.getByTestId('source-application').filter({ hasText: applicant.lastName })).toHaveCount(1);
});

test('a crawler or a visitor who sent Do Not Track is not counted', async ({ page, browser }) => {
  test.setTimeout(6 * 60_000);
  const workspace = await workspaceWithJob(page);
  const url = `/careers/${workspace.org.slug}/${workspace.job.slug}?utm_source=indeed`;

  const crawler = await newContext(browser, { userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' });
  try {
    const beacon = crawler.page.waitForResponse((response) => isBeacon(response.url(), response.request().method()));
    await crawler.page.goto(url);
    expect((await beacon).status()).toBe(204);
  } finally {
    await closeClient(crawler.context);
  }

  const private_ = await newContext(browser, { userAgent: VISITOR_USER_AGENT });
  try {
    await private_.context.addInitScript(() => Object.defineProperty(navigator, 'doNotTrack', { value: '1' }));
    let sent = false;
    private_.page.on('request', (request) => (sent ||= isBeacon(request.url(), request.method())));
    await private_.page.goto(url);
    await expect(private_.page.getByTestId('public-job')).toBeVisible();
    await private_.page.waitForTimeout(1_500);
    expect(sent).toBe(false);
  } finally {
    await closeClient(private_.context);
  }

  await open(page, '/app/reports');
  await expect(page.getByTestId('source-row').filter({ hasText: 'indeed' })).toHaveCount(0);
});
