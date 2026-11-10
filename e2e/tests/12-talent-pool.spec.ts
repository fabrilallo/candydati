import { expect, test } from '../support/test';
import { open } from '../support/nav';
import { workspaceWithJob } from '../support/scenario';

test('"Find people" opens the database search of the job, which searches only on the criteria the recruiter sets', async ({ page }) => {
  const workspace = await workspaceWithJob(page);
  await open(page, `/app/jobs/${workspace.job.id}/candidates`);
  await page.getByTestId('find-people-action').click();
  await expect(page).toHaveURL(new RegExp(`/app/jobs/${workspace.job.id}/talent-pool$`));
  await expect(page.getByTestId('tab-talent-pool')).toBeVisible();

  // No criteria: nothing is searched.
  await page.getByTestId('talent-search-skills').fill('');
  await page.getByTestId('talent-search-location').fill('');
  await page.getByTestId('talent-search-start').click();
  await expect(page.getByTestId('talent-search-error')).toBeVisible();

  // A new organization has nobody in its talent pool yet.
  await page.getByTestId('talent-search-skills').fill('Go');
  await page.getByTestId('talent-search-start').click();
  await expect(page.getByTestId('talent-search-none')).toBeVisible();
});
