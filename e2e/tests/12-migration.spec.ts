import type { Page } from '@playwright/test';
import { expect, test } from '../support/test';
import { buildMigrationPackage, type MigrationFixture } from '../support/migration';
import { load, open } from '../support/nav';
import { workspaceWithJob } from '../support/scenario';

/**
 * Migration from another ATS (ADR 0009): a generated package goes through the wizard (preview, stage mapping in bulk, the
 * three declarations), lands as closed jobs with their history, and the undo takes it all away again.
 */

/** Source, then the package; ends on the preview, where nothing has been written yet. */
async function uploadAndPreview(page: Page, pkg: MigrationFixture): Promise<void> {
  await open(page, '/app/migrations/new');
  await expect(page.getByTestId('migration-where')).toContainText('skill');
  await page.getByTestId('source-package').click();
  await page.getByTestId('migration-input').setInputFiles({ name: 'package.zip', mimeType: 'application/zip', buffer: pkg.zip });
  await expect(page.getByTestId('migration-picked')).toContainText('package.zip');
  await page.getByTestId('migration-upload').click();

  await expect(page.getByTestId('migration-preview-step')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('[data-figure="jobs"]')).toContainText('2');
  await expect(page.locator('[data-figure="candidates"]')).toContainText('2');
  await expect(page.locator('[data-figure="applications"]')).toContainText('2');
  await expect(page.locator('[data-figure="notes"]')).toContainText('1');
  await expect(page.locator('[data-consent="given"]')).toContainText('1');
  await expect(page.locator('[data-consent="toRenew"]')).toContainText('1');
  await expect(page.locator('[data-consent="expired"]')).toContainText('1');
  await expect(page.getByTestId('migration-jobs')).toContainText(pkg.jobs.backend);
  await expect(page.getByTestId('migration-jobs')).toContainText(pkg.jobs.analyst);
  await page.getByTestId('migration-issues-show-warning').click();
  await expect(page.locator('[data-code="consent_expired"]')).toContainText('conservazione già scaduta');
  await expect(page.locator('body')).not.toContainText(pkg.bruno.email);
}

/** Stages: the shared name has no type yet, one choice maps it in every job; then the responsibility step. */
async function mapAndConfirm(page: Page, pkg: MigrationFixture): Promise<void> {
  await page.getByTestId('migration-preview-next').click();
  await expect(page.getByTestId('migration-stages-step')).toBeVisible();
  await expect(page.getByTestId('migration-remaining')).toContainText('2 fasi ancora da scegliere');
  await expect(page.getByTestId('migration-stages-next')).toBeDisabled();
  await page.locator('[data-testid="migration-stage-names"] li', { hasText: pkg.sharedStage }).getByTestId('migration-name-select').selectOption('received');
  await expect(page.getByTestId('migration-all-mapped')).toBeVisible();
  await page.getByTestId('migration-stages-next').click();

  await expect(page.getByTestId('migration-confirm-step')).toBeVisible();
  await expect(page.getByTestId('migration-responsibility-box')).toContainText('Non verifica la base giuridica');
  const confirm = page.getByTestId('migration-confirm');
  for (const key of ['controller', 'previewChecked', 'processorsOwned']) {
    await expect(confirm).toBeDisabled();
    await page.getByTestId(`declaration-${key}`).check();
  }
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByTestId('migration-result-step')).toHaveAttribute('data-status', 'done', { timeout: 120_000 });
  await expect(page.getByTestId('migration-written')).toContainText('2 annunci');
  await expect(page.getByTestId('migration-written')).toContainText('2 candidature');
}

/** The pipeline of a migrated closed job, opened from the jobs list, with its decided applications shown. */
async function openPipelineOf(page: Page, title: string): Promise<void> {
  await open(page, '/app/jobs');
  const row = page.getByTestId('job-row').filter({ hasText: title });
  if (!(await row.isVisible())) await page.getByTestId('show-all').click().catch(() => undefined);
  await expect(row).toBeVisible();
  await expect(row).toContainText('Chiuso');
  const href = await row.getByTestId('job-link').getAttribute('href');
  await open(page, `${href}/candidates`);
  // Migrated applications carry their outcome: they sit in the closed "Esiti" section, folded by default.
  await page.getByRole('button', { name: /^Esiti/ }).click();
}

/** The person with a CV: the note by someone who was never a member, the old email, the CV that came across. */
async function checkAda(page: Page, pkg: MigrationFixture): Promise<void> {
  await openPipelineOf(page, pkg.jobs.backend);
  const ada = page.getByTestId('candidate-card').filter({ hasText: pkg.ada.last });
  await expect(ada).toBeVisible();
  await expect(page.getByTestId('candidate-card').filter({ hasText: pkg.bruno.last })).toHaveCount(0);
  await ada.getByTestId('card-name').click();
  await expect(page.getByTestId('candidate-name')).toContainText(pkg.ada.last);
  const sheet = page.getByRole('dialog');
  await sheet.getByTestId('tab-notes').click();
  const note = page.getByTestId('note').filter({ hasText: pkg.noteText });
  await expect(note).toContainText(pkg.externalAuthor);
  await expect(note.getByTestId('note-imported')).toBeVisible();
  await sheet.getByTestId('tab-messages').click();
  const message = page.getByTestId('message').filter({ hasText: pkg.emailSubject });
  await expect(message.getByTestId('message-historical')).toBeVisible();
  await sheet.getByTestId('tab-cv').click();
  await expect(page.getByTestId('cv-download').first()).toBeVisible();
  await page.keyboard.press('Escape');
}

/** The person with no CV gets a clear state, not a broken download. */
async function checkCarla(page: Page, pkg: MigrationFixture): Promise<void> {
  await openPipelineOf(page, pkg.jobs.analyst);
  const carla = page.getByTestId('candidate-card').filter({ hasText: pkg.carla.last });
  await expect(carla).toBeVisible();
  await carla.getByTestId('card-name').click();
  await page.getByRole('dialog').getByTestId('tab-cv').click();
  await expect(page.getByTestId('cv-none')).toContainText('altro ATS');
  await expect(page.getByTestId('cv-download')).toHaveCount(0);
  await page.keyboard.press('Escape');
}

/** Stage history: the reports count the stages each application went through, from the migrated events. */
async function checkStageHistory(page: Page, pkg: MigrationFixture): Promise<void> {
  await open(page, '/app/reports');
  await page.getByTestId('report-period').selectOption('last365');
  await page.getByTestId('report-job').selectOption({ label: pkg.jobs.backend });
  await expect(page.getByTestId('funnel-row').filter({ hasText: 'Colloquio HR' }).first()).toBeVisible();
}

/** Undo: the migration says what goes, and both jobs and their people are gone. */
async function undoAndCheck(page: Page, pkg: MigrationFixture): Promise<void> {
  await open(page, '/app/migrations');
  const item = page.getByTestId('migration-item').first();
  await expect(item).toHaveAttribute('data-status', 'done');
  await expect(item).toContainText('da oldats');
  await item.getByTestId('migration-list-undo').click();
  const dialog = page.getByTestId('migration-undo-dialog');
  await expect(dialog.getByTestId('migration-undo-deleted')).toContainText('persone');
  await expect(dialog.getByTestId('migration-undo-kept')).toContainText('Restano le persone che hanno confermato');
  await page.getByTestId('migration-undo-confirm').click();
  await expect(page.getByTestId('migration-item').first()).toHaveAttribute('data-status', 'undone');

  await open(page, '/app/jobs');
  await expect(page.getByTestId('job-row').filter({ hasText: pkg.jobs.backend })).toHaveCount(0);
  await expect(page.getByTestId('job-row').filter({ hasText: pkg.jobs.analyst })).toHaveCount(0);
  await load(page, '/app/candidates');
  await expect(page.locator('body')).not.toContainText(pkg.ada.last);
}

test('a migration package is previewed, mapped, confirmed, visible with its history, and undone', async ({ page }) => {
  await workspaceWithJob(page);
  const pkg = buildMigrationPackage();
  await uploadAndPreview(page, pkg);
  await mapAndConfirm(page, pkg);
  await checkAda(page, pkg);
  await checkCarla(page, pkg);
  await checkStageHistory(page, pkg);
  await undoAndCheck(page, pkg);
});
