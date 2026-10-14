import { expect, type Browser, type Page } from '@playwright/test';
import { closeClient } from '../support/client';
import { MAILPIT_URL, PASSWORD } from '../support/env';
import { makePdf } from '../support/files';
import { linkIn, waitForMail } from '../support/mailpit';
import { load } from '../support/nav';
import { publishPrivacyNotice } from '../support/privacy';
import { createOrganization, newContext, signUp } from '../support/session';
import { token } from '../support/unique';
import { api, uploadCareersImage } from './api';
import { CAREERS_IMAGES, careersDocument } from './careers-content';
import { bokehImage, PALETTES } from './images';
import { JOBS } from './jobs-content';
import { emailOf, FEATURED, INTERVIEWER, OWNER, PEOPLE, type Person } from './people';

export interface Seeded {
  readonly orgSlug: string;
  readonly backendJobId: string;
  readonly featuredCandidateId: string;
}

interface StageRef {
  readonly id: string;
}
interface Card {
  readonly id: string;
  readonly candidate: { readonly id: string; readonly lastName: string };
}
interface Pipeline {
  readonly stages: readonly StageRef[];
  readonly applications: readonly Card[];
}

/** Raw JSON call (Better Auth answers without the envelope); returns the status and the parsed body. */
const authCall = async (page: Page, path: string, body: unknown): Promise<{ status: number; data: unknown }> =>
  page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(path, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const text = await response.text();
      return { status: response.status, data: text ? (JSON.parse(text) as unknown) : null };
    },
    { path, body },
  );

/**
 * The owner keeps one clean address across runs (it shows in the sidebar): the first run signs her up, later runs sign in
 * and give her a new organization with the same visible name. Only the slug carries a short suffix.
 */
const createWorkspace = async (page: Page): Promise<string> => {
  const slug = `officina-digitale-${token().slice(-5)}`;
  const owner = { name: OWNER.name, email: OWNER.email, password: PASSWORD };
  await load(page, '/login');
  const signIn = await authCall(page, '/api/auth/sign-in/email', { email: owner.email, password: owner.password });
  if (signIn.status === 200) {
    const created = await authCall(page, '/api/auth/organization/create', { name: 'Officina Digitale', slug });
    const organizationId = (created.data as { id?: string } | null)?.id;
    if (created.status !== 200 || !organizationId) throw new Error(`Organization not created: ${JSON.stringify(created.data)}`);
    await authCall(page, '/api/auth/organization/set-active', { organizationId });
    await load(page, '/app');
  } else {
    await signUp(page, owner);
    await createOrganization(page, { name: 'Officina Digitale', slug });
  }
  await publishPrivacyNotice(page, 'privacy@example.com');
  return slug;
};

/** Every ad created and published through the API the editor uses; returns the ids in the order of `JOBS`. */
const createJobs = async (page: Page): Promise<readonly { id: string; slug: string }[]> => {
  const created: { id: string; slug: string }[] = [];
  // Last first: the list shows the newest on top, and the Backend ad should lead it.
  for (const content of [...JOBS].reverse()) {
    const job = await api<{ id: string; slug: string }>(page, 'POST', '/api/v1/jobs', { content });
    await api(page, 'POST', `/api/v1/jobs/${job.id}/publish`);
    created.unshift(job);
  }
  return created;
};

const publishCareersPage = async (page: Page): Promise<void> => {
  const upload = async (palette: keyof typeof PALETTES, seed: number, alt: string): Promise<string> =>
    uploadCareersImage(page, await bokehImage(PALETTES[palette], seed), alt);
  const hero = await upload('dusk', 11, CAREERS_IMAGES.hero);
  const office = await upload('garden', 7, CAREERS_IMAGES.office);
  const gallery = [await upload('terracotta', 3, CAREERS_IMAGES.gallery[0]), await upload('slate', 5, CAREERS_IMAGES.gallery[1]), await upload('cobalt', 9, CAREERS_IMAGES.gallery[2])];
  const current = await api<{ revision: number }>(page, 'GET', '/api/v1/careers-page');
  const saved = await api<{ revision: number }>(page, 'PUT', '/api/v1/careers-page/draft', {
    revision: current.revision,
    document: careersDocument({ hero, office, gallery }),
  });
  await api(page, 'POST', '/api/v1/careers-page/publish', { revision: saved.revision });
};

/** The public form, like `support/apply.ts`, with a CV of the person's own. */
const apply = async (page: Page, orgSlug: string, jobSlug: string, person: Person): Promise<void> => {
  await load(page, `/careers/${orgSlug}/${jobSlug}`);
  await page.getByTestId('apply-cta').click();
  await page.locator('#apply-first-name').fill(person.firstName);
  await page.locator('#apply-last-name').fill(person.lastName);
  await page.locator('#apply-email').fill(emailOf(person));
  const cv = makePdf([`${person.firstName} ${person.lastName}`, emailOf(person), ...person.cv]);
  await page.getByTestId('cv-input').setInputFiles({ name: `CV ${person.firstName} ${person.lastName}.pdf`, mimeType: 'application/pdf', buffer: cv });
  await expect(page.getByTestId('cv-file')).toBeVisible();
  await page.getByTestId('consent-selection').check();
  await page.getByTestId('consent-pool').check();
  await page.getByTestId('apply-submit').click();
  await expect(page.getByTestId('apply-success')).toBeVisible();
};

/** Each applicant from a browser of their own (own client address, so the public rate limit never trips). */
const applyAll = async (browser: Browser, orgSlug: string, jobSlug: string): Promise<void> => {
  for (const person of PEOPLE) {
    const visitor = await newContext(browser);
    try {
      await apply(visitor.page, orgSlug, jobSlug, person);
    } finally {
      await closeClient(visitor.context);
    }
  }
};

const decorate = async (page: Page, card: Card, person: Person): Promise<void> => {
  if (person.tags) await api(page, 'PATCH', `/api/v1/candidates/${card.candidate.id}`, { tags: person.tags });
  for (const body of person.notes ?? []) await api(page, 'POST', `/api/v1/candidates/${card.candidate.id}/notes`, { body, applicationId: card.id });
};

const move = async (page: Page, pipeline: Pipeline, person: Person): Promise<Card> => {
  const card = pipeline.applications.find((application) => application.candidate.lastName === person.lastName);
  if (!card) throw new Error(`No application for ${person.lastName}`);
  const stage = pipeline.stages[person.stage];
  if (person.stage > 0 && stage) await api(page, 'POST', `/api/v1/applications/${card.id}/move`, { stageId: stage.id });
  await decorate(page, card, person);
  return card;
};

/** An external interviewer on the technical interview, so the featured candidate gets real feedback. */
const assignInterviewer = async (page: Page, jobId: string, stageId: string): Promise<void> => {
  await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${INTERVIEWER.email}"`)}`, { method: 'DELETE' });
  await api(page, 'PUT', `/api/v1/jobs/${jobId}/interviewers`, {
    stages: [{ stageId, interviewers: [{ kind: 'external', name: INTERVIEWER.name, email: INTERVIEWER.email }] }],
  });
};

const FEEDBACK_ANSWERS = [
  'Ha progettato dal vivo un’API per le disponibilità degli studi, con indici e transazioni ben motivati. Test chiari e ordinati.',
  'Esperienza limitata con le code di messaggi: da approfondire nell’incontro con il team.',
  'Ha chiesto come funzionano la reperibilità e le revisioni del codice.',
];

/** The interviewer opens the link of the email on their own browser and leaves feedback, without an account. */
const leaveFeedback = async (browser: Browser): Promise<void> => {
  const mail = await waitForMail(INTERVIEWER.email);
  const link = linkIn(mail, /\/feedback\//);
  const visitor = await newContext(browser);
  try {
    const { page } = visitor;
    await load(page, new URL(link).pathname);
    const answers = page.locator('[data-testid^="answer-"]');
    await expect(answers.first()).toBeVisible();
    const count = await answers.count();
    for (let index = 0; index < count; index += 1) await answers.nth(index).fill(FEEDBACK_ANSWERS[index] ?? FEEDBACK_ANSWERS[0]!);
    await page.getByTestId('recommendation-proceed').click();
    await page.getByTestId('feedback-submit').click();
    await expect(page.getByTestId('feedback-done')).toBeVisible();
  } finally {
    await closeClient(visitor.context);
  }
};

/** Builds the whole README organization on the signed-in `page`; visitors and the interviewer use browsers of their own. */
export const seed = async (browser: Browser, page: Page): Promise<Seeded> => {
  const orgSlug = await createWorkspace(page);
  const [backend] = await createJobs(page);
  if (!backend) throw new Error('The Backend job was not created');
  await publishCareersPage(page);
  await applyAll(browser, orgSlug, backend.slug);

  const pipeline = await api<Pipeline>(page, 'GET', `/api/v1/jobs/${backend.id}/pipeline`);
  for (const person of PEOPLE.filter((p) => p !== FEATURED)) await move(page, pipeline, person);
  await assignInterviewer(page, backend.id, pipeline.stages[FEATURED.stage]!.id);
  const featured = await move(page, pipeline, FEATURED);
  await leaveFeedback(browser);
  return { orgSlug, backendJobId: backend.id, featuredCandidateId: featured.candidate.id };
};
