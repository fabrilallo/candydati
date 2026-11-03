import { expect, test } from '../support/test';
import { open } from '../support/nav';
import { createPublishedJob } from '../support/jobs';
import { publishPrivacyNotice } from '../support/privacy';
import { newWorkspace } from '../support/session';
import { token } from '../support/unique';

/** Right edge of every element in the row, against the row's own right edge (the row clips nothing by design). */
const overflowsRow = (row: Element): boolean => {
  const limit = row.getBoundingClientRect().right + 1;
  return Array.from(row.querySelectorAll('*')).some((child) => child.getBoundingClientRect().right > limit);
};

test('a long title stays in its column and the row keeps every cell inside it', async ({ page }) => {
  const { owner } = await newWorkspace(page);
  await publishPrivacyNotice(page, owner.email);
  const title = `Senior Fullstack TypeScript Developer (Product Engineer) ${token()} (m/f/x)`;
  await createPublishedJob(page, { title });

  for (const width of [1024, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await open(page, '/app/jobs');
    const row = page.getByTestId('job-row').filter({ hasText: title });
    await expect(row.getByTestId('job-salary')).toBeVisible();
    const link = await row.getByTestId('job-link').boundingBox();
    const salary = await row.getByTestId('job-salary').boundingBox();
    expect(link && salary && link.x + link.width <= salary.x, `title overlaps the salary at ${width}px`).toBe(true);
    expect(await row.evaluate(overflowsRow), `a cell leaves the row at ${width}px`).toBe(false);
  }
});
