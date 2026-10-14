import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { closeClient, isolateClient } from '../support/client';
import { load, open } from '../support/nav';
import { api } from './api';
import { capture } from './capture';
import { FEATURED, PEOPLE } from './people';
import { seed, type Seeded } from './seed';

/**
 * The four README screenshots, from a fresh organization built through the app (`pnpm --filter @tt/e2e screenshots`).
 * Set SCREENSHOTS_REUSE=1 to capture again from the organization of the previous run (it keeps the session in .results).
 */

const STATE_FILE = resolve(import.meta.dirname, '../.results/readme-screenshots-state.json');
const VIEWPORT = { width: 1440, height: 900 } as const;

interface SavedState {
  readonly seeded: Seeded;
  readonly storage: Awaited<ReturnType<BrowserContext['storageState']>>;
}

const newShotContext = async (browser: Browser, storage?: SavedState['storage']): Promise<{ context: BrowserContext; page: Page }> => {
  const context = await browser.newContext({
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    colorScheme: 'light',
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    ...(storage ? { storageState: storage } : {}),
  });
  await isolateClient(context);
  return { context, page: await context.newPage() };
};

const ownerSession = async (browser: Browser): Promise<{ context: BrowserContext; page: Page; seeded: Seeded }> => {
  if (process.env.SCREENSHOTS_REUSE && existsSync(STATE_FILE)) {
    const saved = JSON.parse(await readFile(STATE_FILE, 'utf8')) as SavedState;
    const { context, page } = await newShotContext(browser, saved.storage);
    return { context, page, seeded: saved.seeded };
  }
  const { context, page } = await newShotContext(browser);
  const seeded = await seed(browser, page);
  await writeFile(STATE_FILE, JSON.stringify({ seeded, storage: await context.storageState() } satisfies SavedState));
  return { context, page, seeded };
};

/** The CV reader runs in the worker: the cards get their headline, city and years a little after the application. */
const cvsRead = async (page: Page, jobId: string): Promise<void> => {
  const headlines = async (): Promise<number> => {
    const pipeline = await api<{ applications: readonly { candidate: { headline: string | null } }[] }>(page, 'GET', `/api/v1/jobs/${jobId}/pipeline`);
    return pipeline.applications.filter((application) => application.candidate.headline !== null).length;
  };
  await expect.poll(headlines, { timeout: 180_000, intervals: [2_000] }).toBe(PEOPLE.length);
};

const shootPipeline = async (page: Page, seeded: Seeded): Promise<void> => {
  await load(page, '/app');
  await cvsRead(page, seeded.backendJobId);
  await load(page, `/app/jobs/${seeded.backendJobId}/candidates`);
  await expect(page.getByTestId('candidate-card')).toHaveCount(PEOPLE.length);
  await capture(page, 'pipeline');
};

/** The sheet opened from the pipeline card, on the feedback tab. */
const shootCandidate = async (page: Page): Promise<void> => {
  await page.getByTestId('candidate-card').filter({ hasText: FEATURED.lastName }).getByTestId('card-name').click();
  await expect(page.getByTestId('candidate-name')).toContainText(FEATURED.lastName);
  await page.getByTestId('tab-feedback').click();
  await expect(page.getByTestId('feedback-group-submitted')).toBeVisible();
  await capture(page, 'candidate');
};

const shootJobEditor = async (page: Page, seeded: Seeded): Promise<void> => {
  await open(page, `/app/jobs/${seeded.backendJobId}`);
  await expect(page.getByTestId('save')).toBeVisible();
  await capture(page, 'job-editor');
};

/** Where the top sections of the careers page end (hero, numbers, "who we are"), so the image never cuts one in half. */
const CAREERS_MAX_HEIGHT = 1800;
const sectionsBottom = async (page: Page): Promise<number> =>
  page.locator('main#main').evaluate((main, max) => {
    const bottoms = Array.from(main.children).map((section) => Math.round(section.getBoundingClientRect().bottom + window.scrollY));
    return bottoms.filter((bottom) => bottom <= max).pop() ?? max;
  }, CAREERS_MAX_HEIGHT);

const shootCareers = async (browser: Browser, seeded: Seeded): Promise<void> => {
  const visitor = await newShotContext(browser);
  try {
    await load(visitor.page, `/careers/${seeded.orgSlug}`);
    await expect(visitor.page.getByTestId('site-hero-image')).toBeVisible();
    await capture(visitor.page, 'careers', { x: 0, y: 0, width: VIEWPORT.width, height: await sectionsBottom(visitor.page) });
  } finally {
    await closeClient(visitor.context);
  }
};

test('README screenshots', async ({ browser }) => {
  const { context, page, seeded } = await ownerSession(browser);
  try {
    await shootPipeline(page, seeded);
    await shootCandidate(page);
    await shootJobEditor(page, seeded);
    await shootCareers(browser, seeded);
  } finally {
    await closeClient(context);
  }
});
