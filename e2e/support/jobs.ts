import { expect, type Locator, type Page } from '@playwright/test';
import { open } from './nav';

export interface JobSpec {
  readonly title: string;
  readonly role?: string;
  readonly salaryMin?: string;
  readonly salaryMax?: string;
  readonly responseDays?: string;
  /** Stages of the process, as `[type, duration in minutes, conductor]`. */
  readonly stages?: readonly (readonly [string, string, string])[];
}

const DEFAULT_STAGES: NonNullable<JobSpec['stages']> = [
  ['hr_interview', '30', 'recruiter'],
  ['technical_interview', '60', 'technical_lead'],
];

const field = (page: Page, id: string): Locator => page.locator(`#job-field-${id}`);

/** Fills a StringListField: first item through "add", each next one with Enter. */
const fillList = async (page: Page, id: string, items: readonly string[]): Promise<void> => {
  await field(page, id).locator(`#job-field-${id}-add`).click();
  for (const [index, item] of items.entries()) {
    const input = page.locator(`#job-field-${id}-${index}`);
    await input.fill(item);
    if (index < items.length - 1) await input.press('Enter');
  }
};

/** Every field the publish rules ask for, except the ones named in `skip` (field paths used to prove the block). */
export const fillJob = async (page: Page, spec: JobSpec, skip: readonly string[] = []): Promise<void> => {
  const has = (key: string): boolean => !skip.includes(key);
  await field(page, 'title').fill(spec.title);
  if (has('role')) await field(page, 'role').selectOption(spec.role ?? 'backend_developer');
  if (has('seniority')) await field(page, 'seniority').selectOption('senior');
  if (has('contractType')) await field(page, 'contractType').selectOption('permanent');
  if (has('salary.min')) await field(page, 'salary-min').fill(spec.salaryMin ?? '45000');
  if (has('salary.max')) await field(page, 'salary-max').fill(spec.salaryMax ?? '60000');
  if (has('workMode')) await page.locator('#job-field-workMode').getByRole('radio', { name: 'Da remoto' }).click();
  if (has('location.country')) await field(page, 'location-country').selectOption('IT');
  if (has('responseDays')) await field(page, 'responseDays').fill(spec.responseDays ?? '7');
  const stages = spec.stages ?? DEFAULT_STAGES;
  for (const [index, [type, duration, by]] of stages.entries()) {
    await page.getByRole('button', { name: 'Aggiungi fase' }).click();
    await field(page, `process-${index}-type`).selectOption(type);
    await field(page, `process-${index}-duration`).selectOption(duration);
    await field(page, `process-${index}-by`).selectOption(by);
  }
  await fillList(page, 'responsibilities', ['Progettare le API', 'Rivedere il codice del team', 'Mantenere i servizi in produzione']);
  await fillList(page, 'requirements-mustHave', ['Esperienza con TypeScript']);
};

export const saveDraft = async (page: Page): Promise<string> => {
  await page.getByTestId('save').click();
  await page.waitForURL(/\/app\/jobs\/(?!new)[^/]+/);
  await expect(page.getByTestId('save')).toBeEnabled();
  return /\/app\/jobs\/([^/?#]+)/.exec(page.url())?.[1] ?? '';
};

/** Publishes the open draft; accepts the "below the recommended score" step when it shows up. */
export const publishOpenJob = async (page: Page): Promise<void> => {
  await expect(page.getByTestId('publish')).toBeEnabled();
  await page.getByTestId('publish').click();
  const done = page.getByTestId('published-dialog');
  const below = page.getByTestId('publish-anyway');
  await expect(done.or(below)).toBeVisible();
  if (await below.isVisible()) await below.click();
  await expect(done).toBeVisible();
};

export interface PublishedJob {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
}

/** Slug of the ad, read from the address the "published" dialog shows. */
export const publishedSlug = async (page: Page): Promise<string> => {
  const url = await page.getByTestId('published-dialog-url').innerText();
  return new URL(url).pathname.split('/').pop() ?? '';
};

/** New job through the UI, fully filled, saved and published. */
export const createPublishedJob = async (page: Page, spec: JobSpec): Promise<PublishedJob> => {
  await open(page, '/app/jobs/new');
  await fillJob(page, spec);
  const id = await saveDraft(page);
  // Saving a new ad moves the editor to the ad's own address: come back to it so publishing starts from the settled page.
  await open(page, '/app/jobs');
  await open(page, `/app/jobs/${id}`);
  await publishOpenJob(page);
  const slug = await publishedSlug(page);
  await page.getByRole('button', { name: 'Fatto' }).click();
  return { id, slug, title: spec.title };
};
