import { expect, test } from '../support/test';
import { makePdf, makeZip } from '../support/files';
import { load, open } from '../support/nav';
import { workspaceWithJob } from '../support/scenario';
import { token } from '../support/unique';

test('importing CVs and a spreadsheet shows a preview with confidence, creates the candidates, and can be undone', async ({ page }) => {
  const workspace = await workspaceWithJob(page);
  const id = token();
  const people = [
    { first: 'Marco', last: `Rossi${id}`, email: `e2e-import-a-${id}@e2e.test` },
    { first: 'Elena', last: `Bianchi${id}`, email: `e2e-import-b-${id}@e2e.test` },
  ] as const;
  const zip = makeZip(
    Object.fromEntries(
      people.map((p, i) => [`cv-${i + 1}.pdf`, makePdf([`${p.first} ${p.last}`, p.email, 'Sviluppatore backend, 5 anni di esperienza con Node.js'])]),
    ),
  );
  const csv = `Nome,Cognome,Email,Telefono\n${people.map((p, i) => `${p.first},${p.last},${p.email},+39 333 000 000${i}`).join('\n')}\n`;

  await open(page, '/app/imports/new');
  await page.getByTestId('import-files-input').setInputFiles([
    { name: `cv-${id}.zip`, mimeType: 'application/zip', buffer: zip },
    { name: `candidati-${id}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) },
  ]);
  await expect(page.getByTestId('import-picked')).toBeVisible();
  await page.getByTestId('import-job').selectOption({ label: workspace.job.title });
  await page.getByTestId('import-upload').click();

  // The analysis runs in the worker; the mapping step (CSV columns) comes first when a spreadsheet is present.
  const mapping = page.getByTestId('mapping-next');
  const preview = page.getByTestId('import-preview-step');
  await expect(mapping.or(preview)).toBeVisible({ timeout: 60_000 });
  if (await mapping.isVisible()) await mapping.click();

  // Preview: every candidate carries a confidence level.
  await expect(preview).toBeVisible({ timeout: 60_000 });
  const items = page.getByTestId('preview-item');
  await expect(items).toHaveCount(2);
  await expect(items.getByTestId('confidence-pill')).toHaveCount(2);
  for (const p of people) await expect(items.filter({ hasText: p.email })).toBeVisible();
  await page.getByTestId('preview-next').click();

  // Confirm.
  await expect(page.getByTestId('confirm-summary')).toBeVisible();
  await page.getByTestId('confirm-import').click();
  await expect(page.getByTestId('import-result-step')).toHaveAttribute('data-status', 'done', { timeout: 60_000 });

  // The candidates are in the pipeline of the job.
  await load(page, `/app/jobs/${workspace.job.id}/candidates`);
  for (const p of people) await expect(page.getByTestId('candidate-card').filter({ hasText: p.last })).toBeVisible();

  // Undo removes them all.
  await open(page, '/app/imports');
  const batch = page.getByTestId('import-item').first();
  await expect(batch).toHaveAttribute('data-status', 'done');
  await batch.getByTestId('import-undo').click();
  await page.getByTestId('undo-confirm').click();
  await expect(page.getByTestId('import-item').first()).not.toHaveAttribute('data-status', 'done');

  await load(page, `/app/jobs/${workspace.job.id}/candidates`);
  await expect(page.getByTestId('pipeline-summary')).toBeVisible();
  for (const p of people) await expect(page.getByTestId('candidate-card').filter({ hasText: p.last })).toHaveCount(0);
});
