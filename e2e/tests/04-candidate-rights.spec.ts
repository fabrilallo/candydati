import { unzipSync, strFromU8 } from 'fflate';
import { expect, test } from '../support/test';
import { open } from '../support/nav';
import { waitForMail } from '../support/mailpit';
import { applyAs, newApplicant, workspaceWithJob } from '../support/scenario';
import { closeClient } from '../support/client';
import { newContext } from '../support/session';

test('the recruiter exports a candidate, erases them by typing the name, and they vanish from search', async ({ page, browser }) => {
  const workspace = await workspaceWithJob(page);
  const applicant = newApplicant();
  const fullName = `${applicant.firstName} ${applicant.lastName}`;

  const visitor = await newContext(browser);
  try {
    await applyAs(visitor.page, workspace, applicant);
  } finally {
    await closeClient(visitor.context);
  }
  await waitForMail(applicant.email);

  // Found in the candidate database before erasure.
  await open(page, '/app/candidates');
  await page.getByTestId('candidates-search').fill(applicant.lastName);
  const row = page.getByTestId('candidate-row').filter({ hasText: applicant.lastName });
  await expect(row).toBeVisible();
  await row.getByTestId('candidate-link').click();
  await expect(page.getByTestId('candidate-name')).toContainText(applicant.lastName);

  await page.getByTestId('tab-privacy').click();

  // Export: a ZIP that carries the candidate's data.
  const download = page.waitForEvent('download');
  await page.getByTestId('export-zip').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.zip$/);
  const path = await file.path();
  const { readFile } = await import('node:fs/promises');
  const entries = unzipSync(new Uint8Array(await readFile(path)));
  const names = Object.keys(entries);
  expect(names.length).toBeGreaterThan(0);
  expect(names.map((n) => strFromU8(entries[n] ?? new Uint8Array())).some((text) => text.includes(applicant.email))).toBe(true);

  // Erasure: the destructive button only wakes up when the full name is typed.
  await page.getByTestId('erase-open').click();
  const dialog = page.getByTestId('erase-dialog');
  await expect(dialog.getByTestId('erase-confirm')).toBeDisabled();
  await dialog.getByTestId('erase-name').fill(fullName);
  await expect(dialog.getByTestId('erase-confirm')).toBeEnabled();
  await dialog.getByTestId('erase-confirm').click();
  await expect(dialog).toBeHidden();

  // Gone from the candidate database.
  await open(page, '/app/candidates');
  await page.getByTestId('candidates-search').fill(applicant.lastName);
  await expect(page.getByTestId('candidates-empty')).toBeVisible();
  await expect(page.getByTestId('candidate-row')).toHaveCount(0);
});
