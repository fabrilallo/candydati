import { devices, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { expect, test } from '../support/test';
import { expectNoViolations } from '../support/a11y';
import { customizeCareersPage } from '../support/careers';
import { closeClient, isolateClient } from '../support/client';
import { PASSWORD } from '../support/env';
import { makePdf, makeZip } from '../support/files';
import { fillJob, saveDraft } from '../support/jobs';
import { linkIn, waitForMail } from '../support/mailpit';
import { buildMigrationPackage } from '../support/migration';
import { hydrated, load, open } from '../support/nav';
import { applyAs, newApplicant, workspaceWithJob, type JobWorkspace } from '../support/scenario';
import { createOrganization, newContext, signUp } from '../support/session';
import { identity, orgIdentity, token } from '../support/unique';

/**
 * Automated WCAG 2.1 A and AA checks (axe) on every main page, in light and dark. No rule is disabled: a page that
 * fails is fixed in the app. Animations are off (`reducedMotion`), so colours are measured on the settled page.
 */
test.describe.configure({ mode: 'serial' });
test.setTimeout(10 * 60_000);

const settle = async (page: Page, testId?: string): Promise<void> => {
  await (testId ? page.getByTestId(testId) : page.locator('main, [role=main]').first()).first().waitFor({ state: 'visible' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
};

const audit = async (page: Page, path: string, name: string, testId?: string): Promise<void> => {
  await open(page, path);
  await settle(page, testId);
  await expectNoViolations(page, name);
};

let owner: Page;
let ownerContext: BrowserContext;
let workspace: JobWorkspace;
let candidateId = '';
let browserRef: Browser;

test.beforeAll(async ({ browser }) => {
  browserRef = browser;
  const made = await newContext(browser);
  ownerContext = made.context;
  owner = made.page;
  await owner.emulateMedia({ reducedMotion: 'reduce' });
  workspace = await workspaceWithJob(owner);
  const applicant = newApplicant('a11y');
  const visitor = await newContext(browser);
  try {
    await applyAs(visitor.page, workspace, applicant);
  } finally {
    await closeClient(visitor.context);
  }
  await load(owner, '/app/candidates');
  const link = owner.locator('a[href^="/app/candidates/"]').first();
  await expect(link).toBeVisible();
  candidateId = /\/app\/candidates\/([^/?#]+)/.exec((await link.getAttribute('href')) ?? '')?.[1] ?? '';
  expect(candidateId).not.toBe('');
});

test.afterAll(async () => {
  await closeClient(ownerContext);
});

const freshPage = async (options: Parameters<Browser['newContext']>[0] = {}): Promise<{ page: Page; context: BrowserContext }> => {
  const context = await browserRef.newContext({ locale: 'it-IT', reducedMotion: 'reduce', ...options });
  await isolateClient(context);
  return { context, page: await context.newPage() };
};

test('login and signup pages', async () => {
  const { page, context } = await freshPage();
  try {
    await load(page, '/login');
    await expectNoViolations(page, 'login');
    await load(page, '/signup');
    await expectNoViolations(page, 'signup');
    await load(page, '/forgot-password');
    await expectNoViolations(page, 'forgot-password');
    await load(page, '/login');
    await page.locator('#email').fill('nobody@e2e.test');
    await page.locator('#password').fill('wrong-password-1');
    await page.locator('form button[type=submit]').click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expectNoViolations(page, 'login with an error');
  } finally {
    await closeClient(context);
  }
});

test('onboarding', async () => {
  const { page, context } = await freshPage();
  try {
    await signUp(page, identity('onboarding', PASSWORD));
    await page.waitForURL(/\/onboarding/);
    await hydrated(page);
    await expectNoViolations(page, 'onboarding');
    await createOrganization(page, orgIdentity());
  } finally {
    await closeClient(context);
  }
});

test('dashboard, lists, reports and help', async () => {
  await audit(owner, '/app', 'dashboard');
  await audit(owner, '/app/jobs', 'jobs list');
  await audit(owner, '/app/attention', 'attention');
  await audit(owner, '/app/tasks', 'tasks');
  await audit(owner, '/app/reports', 'reports');
  await audit(owner, '/app/candidates', 'candidates database');
  await audit(owner, '/app/jobs/templates', 'job templates');
  await audit(owner, '/app/job-requests', 'job requests');
  await audit(owner, '/app/help', 'help');
  await audit(owner, '/app/help?q=link%20tracciato', 'help search');
});

test('job editor, empty and filled', async () => {
  await audit(owner, '/app/jobs/new', 'job editor (empty)');
  await fillJob(owner, { title: `Accessibility Engineer ${token()} (m/f/x)` });
  await expectNoViolations(owner, 'job editor (filled)');
  await saveDraft(owner);
  await expectNoViolations(owner, 'job editor (saved draft)');
  await audit(owner, `/app/jobs/${workspace.job.id}`, 'job editor (published)');
  await audit(owner, `/app/jobs/${workspace.job.id}/team`, 'job team');
  await audit(owner, `/app/jobs/${workspace.job.id}/automations`, 'job automations');
  await audit(owner, `/app/jobs/${workspace.job.id}/distribution`, 'job distribution');
});

test('pipeline board, its menus and dialogs', async () => {
  await audit(owner, `/app/jobs/${workspace.job.id}/candidates`, 'pipeline board', 'pipeline-board');
  await owner.getByTestId('card-menu').first().click();
  await expect(owner.getByRole('menu')).toBeVisible();
  await expectNoViolations(owner, 'pipeline card menu');
  await owner.keyboard.press('Escape');
  await expect(owner.getByRole('menu')).toHaveCount(0);
  // Focus returns to the button that opened the menu.
  await expect(owner.getByTestId('card-menu').first()).toBeFocused();
});

const everyTab = async (page: Page, name: string, scope: Locator = page.locator('body')): Promise<void> => {
  const tabs = scope.locator('[data-testid^="tab-"]');
  const count = await tabs.count();
  expect(count).toBeGreaterThan(3);
  for (let index = 0; index < count; index += 1) {
    const tab = tabs.nth(index);
    const id = (await tab.getAttribute('data-testid')) ?? `tab-${index}`;
    await tab.click();
    await expectNoViolations(page, `${name}, ${id}`);
  }
};

test('candidate sheet in the pipeline, every tab', async () => {
  await open(owner, `/app/jobs/${workspace.job.id}/candidates`);
  const card = owner.getByTestId('candidate-card').first();
  await card.getByTestId('card-name').click();
  await expect(owner.getByTestId('candidate-name')).toBeVisible();
  await everyTab(owner, 'candidate sheet', owner.getByRole('dialog'));
  await owner.keyboard.press('Escape');
  await expect(owner.getByRole('dialog')).toHaveCount(0);
  // Focus goes back to the card that opened the sheet.
  await expect(card.getByTestId('card-name')).toBeFocused();
});

test('candidate detail page, every tab and dialog', async () => {
  await audit(owner, `/app/candidates/${candidateId}`, 'candidate detail', 'candidate-name');
  await everyTab(owner, 'candidate detail');
  await owner.getByTestId('decide-menu').click();
  await owner.getByTestId('detail-decide-not_selected').click();
  await expect(owner.getByRole('dialog')).toBeVisible();
  await expectNoViolations(owner, 'candidate decision dialog');
  await owner.keyboard.press('Escape');
  await expect(owner.getByRole('dialog')).toHaveCount(0);
  await expect(owner.getByTestId('decide-menu')).toBeFocused();
});

test('imports wizard, every step', async () => {
  await audit(owner, '/app/imports', 'imports list');
  await audit(owner, '/app/imports/new', 'imports: files step');
  const id = token();
  const email = `e2e-a11y-import-${id}@e2e.test`;
  const csv = `Nome,Cognome,Email,Telefono\nMarco,Rossi${id},${email},+39 333 000 0000\n`;
  const zip = makeZip({ 'cv-1.pdf': makePdf([`Marco Rossi${id}`, email, 'Sviluppatore backend, 5 anni di esperienza con Node.js']) });
  await owner.getByTestId('import-files-input').setInputFiles([
    { name: `cv-${id}.zip`, mimeType: 'application/zip', buffer: zip },
    { name: `candidati-${id}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) },
  ]);
  await expect(owner.getByTestId('import-picked')).toBeVisible();
  await owner.getByTestId('import-job').selectOption({ label: workspace.job.title });
  await expectNoViolations(owner, 'imports: files picked');
  await owner.getByTestId('import-upload').click();
  const mapping = owner.getByTestId('mapping-next');
  const preview = owner.getByTestId('import-preview-step');
  await expect(mapping.or(preview)).toBeVisible({ timeout: 60_000 });
  if (await mapping.isVisible()) {
    await expectNoViolations(owner, 'imports: mapping step');
    await mapping.click();
  }
  await expect(preview).toBeVisible({ timeout: 60_000 });
  await expect(owner.getByTestId('preview-item')).toHaveCount(1);
  await expectNoViolations(owner, 'imports: preview step');
  await owner.getByTestId('preview-next').click();
  await expect(owner.getByTestId('confirm-summary')).toBeVisible();
  await expectNoViolations(owner, 'imports: confirm step');
  await owner.getByTestId('confirm-import').click();
  await expect(owner.getByTestId('import-result-step')).toHaveAttribute('data-status', 'done', { timeout: 60_000 });
  await expectNoViolations(owner, 'imports: result step');

  // The imported person gets the reconfirmation link: the public consent page.
  const mail = await waitForMail(email, { timeoutMs: 60_000 });
  const consent = await freshPage();
  try {
    await load(consent.page, new URL(linkIn(mail, /\/consent\//)).pathname);
    await expect(consent.page.getByTestId('reconfirm-page')).toBeVisible();
    await expectNoViolations(consent.page, 'consent page');
  } finally {
    await closeClient(consent.context);
  }
  await audit(owner, '/app/imports', 'imports list with a batch');
});

test('migration wizard, every step and the undo dialog', async () => {
  await audit(owner, '/app/migrations', 'migrations list');
  await audit(owner, '/app/migrations/new', 'migrations: source step');
  await owner.getByTestId('source-package').click();
  await expect(owner.getByTestId('migration-upload-step')).toBeVisible();
  await expectNoViolations(owner, 'migrations: package step');
  const pkg = buildMigrationPackage();
  await owner.getByTestId('migration-input').setInputFiles({ name: 'package.zip', mimeType: 'application/zip', buffer: pkg.zip });
  await expect(owner.getByTestId('migration-picked')).toBeVisible();
  await expectNoViolations(owner, 'migrations: package chosen');
  await owner.getByTestId('migration-upload').click();
  await expect(owner.getByTestId('migration-preview-step')).toBeVisible({ timeout: 90_000 });
  await owner.getByTestId('migration-issues-show-warning').click();
  await expect(owner.locator('[data-code="consent_expired"]')).toBeVisible();
  await expectNoViolations(owner, 'migrations: preview step');
  await owner.getByTestId('migration-preview-next').click();
  await expect(owner.getByTestId('migration-stages-step')).toBeVisible();
  await expectNoViolations(owner, 'migrations: stages step, stages to choose');
  await owner.locator('[data-testid="migration-stage-names"] li', { hasText: pkg.sharedStage }).getByTestId('migration-name-select').selectOption('received');
  await expect(owner.getByTestId('migration-all-mapped')).toBeVisible();
  await expectNoViolations(owner, 'migrations: stages step, all mapped');
  await owner.getByTestId('migration-stages-next').click();
  await expect(owner.getByTestId('migration-confirm-step')).toBeVisible();
  await expectNoViolations(owner, 'migrations: responsibility step');
  for (const key of ['controller', 'previewChecked', 'processorsOwned']) await owner.getByTestId(`declaration-${key}`).check();
  await owner.getByTestId('migration-confirm').click();
  await expect(owner.getByTestId('migration-result-step')).toHaveAttribute('data-status', 'done', { timeout: 120_000 });
  await expectNoViolations(owner, 'migrations: result step');
  await owner.getByTestId('migration-undo').click();
  await expect(owner.getByTestId('migration-undo-dialog')).toBeVisible();
  await expectNoViolations(owner, 'migrations: undo dialog');
  await owner.getByTestId('migration-undo-confirm').click();
  await expect(owner.getByTestId('migration-result-step')).toHaveAttribute('data-status', 'undone');
  await expectNoViolations(owner, 'migrations: undone');
  await audit(owner, '/app/migrations', 'migrations list with a batch');
});

test('settings pages', async () => {
  for (const name of ['members', 'privacy', 'email', 'email-templates', 'webhooks', 'distribution', 'api', 'data', 'security', 'audit-log', 'careers']) {
    await audit(owner, `/app/settings/${name}`, `settings: ${name}`);
  }
});

test('public careers pages and the application form', async () => {
  const { page, context } = await freshPage();
  try {
    await load(page, `/careers/${workspace.org.slug}`);
    await expectNoViolations(page, 'careers index');
    await load(page, `/careers/${workspace.org.slug}/${workspace.job.slug}`);
    await expectNoViolations(page, 'public job ad');
    await page.getByTestId('apply-cta').click();
    await expect(page.locator('#apply-first-name')).toBeVisible();
    await expectNoViolations(page, 'application form');
    await page.getByTestId('apply-submit').click();
    await expect(page.locator('#apply-first-name')).toHaveAttribute('aria-invalid', 'true');
    await expectNoViolations(page, 'application form with errors');
  } finally {
    await closeClient(context);
  }
});

test('customized careers page and its editor', async () => {
  const { headline } = await customizeCareersPage(owner);
  await expectNoViolations(owner, 'careers page editor (customized)');
  await owner.getByTestId('careers-preview-mobile').click();
  await expectNoViolations(owner, 'careers page editor (mobile preview)');
  const { page, context } = await freshPage();
  try {
    await load(page, `/careers/${workspace.org.slug}`);
    await expect(page.locator('h1')).toHaveText(headline);
    await page.getByTestId('site-gallery').scrollIntoViewIfNeeded();
    await expectNoViolations(page, 'careers page (customized)');
  } finally {
    await closeClient(context);
  }
  const phone = await freshPage({ ...devices['Pixel 7'], locale: 'it-IT' });
  try {
    await load(phone.page, `/careers/${workspace.org.slug}`);
    await expectNoViolations(phone.page, 'careers page (customized, mobile)');
  } finally {
    await closeClient(phone.context);
  }
});

test('feedback page on a phone', async () => {
  const interviewer = identity('a11y-interviewer', PASSWORD);
  await open(owner, `/app/jobs/${workspace.job.id}`);
  await owner.getByTestId('job-field-process-1-interviewers-add').click();
  await owner.getByTestId('interviewer-external').click();
  await owner.getByLabel('Nome', { exact: false }).last().fill(interviewer.name);
  await owner.locator('#job-field-process-1-interviewers-ext-email').fill(interviewer.email);
  await owner.getByTestId('external-add').click();
  await expect(owner.getByTestId('interviewer-chip').filter({ hasText: interviewer.name })).toBeVisible();
  await owner.getByTestId('save').click();
  await expect(owner.getByTestId('save')).toBeEnabled();

  await open(owner, `/app/candidates/${candidateId}`);
  await owner.getByTestId('move-menu').click();
  await owner.getByRole('menuitem', { name: 'Colloquio tecnico' }).click();
  await expect(owner.getByTestId('candidate-stage')).toContainText('Colloquio tecnico');
  const link = linkIn(await waitForMail(interviewer.email), /\/feedback\//);

  const phone = await freshPage({ ...devices['Pixel 7'], locale: 'it-IT' });
  try {
    await load(phone.page, new URL(link).pathname);
    await expect(phone.page.getByTestId('feedback-page')).toBeVisible();
    await expectNoViolations(phone.page, 'feedback page (mobile)');
  } finally {
    await closeClient(phone.context);
  }
});

test('error pages', async () => {
  const { page, context } = await freshPage();
  try {
    await load(page, `/careers/${workspace.org.slug}/not-a-real-ad`);
    await expectNoViolations(page, 'public ad not found');
    await load(page, '/careers/no-such-organization-here');
    await expectNoViolations(page, 'careers not found');
    await load(page, '/consent/not-a-real-token');
    await expectNoViolations(page, 'consent link invalid');
    await load(page, '/feedback/not-a-real-token');
    await expectNoViolations(page, 'feedback link invalid');
    await page.goto('/this-page-does-not-exist');
    await page.locator('main, h1').first().waitFor();
    await expectNoViolations(page, '404 page');
  } finally {
    await closeClient(context);
  }
  await open(owner, '/app/jobs/00000000-0000-0000-0000-000000000000');
  await settle(owner);
  await expectNoViolations(owner, 'app: job not found');
  await open(owner, '/app/candidates/00000000-0000-0000-0000-000000000000');
  await settle(owner);
  await expectNoViolations(owner, 'app: candidate not found');
});
