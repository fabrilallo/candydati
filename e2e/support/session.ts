import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { linkIn, waitForMail } from './mailpit';
import { identity, orgIdentity, type Identity } from './unique';
import { PASSWORD } from './env';
import { isolateClient } from './client';
import { hydrated, load } from './nav';

export interface Workspace {
  readonly owner: Identity;
  readonly org: { readonly name: string; readonly slug: string };
}

/** Path and query of an absolute link from an email, so the app's router can open it. */
const pathOf = (link: string): string => {
  const url = new URL(link);
  return `${url.pathname}${url.search}`;
};

/**
 * Signs up through the UI, then confirms the address like a person: opens the link of the confirmation email from
 * Mailpit, which signs in and lands on onboarding (no session exists before that).
 */
export const signUp = async (page: Page, who: Identity): Promise<void> => {
  await load(page, '/signup');
  await page.locator('#name').fill(who.name);
  await page.locator('#email').fill(who.email);
  await page.locator('#password').fill(who.password);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL(/\/verify-email/);
  const mail = await waitForMail(who.email, { subject: /conferma|confirm/i });
  await page.goto(pathOf(linkIn(mail, /\/api\/auth\/verify-email/)));
  await page.waitForURL(/\/(onboarding|app)/);
};

export const logIn = async (page: Page, who: Identity): Promise<void> => {
  await load(page, '/login');
  await page.locator('#email').fill(who.email);
  await page.locator('#password').fill(who.password);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL(/\/(onboarding|app)/);
};

/** Creates the organization from the onboarding page and waits for the app shell. */
export const createOrganization = async (page: Page, org: { name: string; slug: string }): Promise<void> => {
  await page.waitForURL(/\/onboarding/);
  await hydrated(page);
  await page.locator('#org-name').fill(org.name);
  await page.locator('#org-slug').fill(org.slug);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL(/\/app(\/|$|\?)/);
  await expect(page.getByTestId('app-shell').or(page.locator('main')).first()).toBeVisible();
};

/** A brand new user owning a brand new organization, signed in on `page`. */
export const newWorkspace = async (page: Page, label = 'owner'): Promise<Workspace> => {
  const owner = identity(label, PASSWORD);
  const org = orgIdentity();
  await signUp(page, owner);
  await createOrganization(page, org);
  return { owner, org };
};

/** Same, in a context of its own (a second person in a second browser). */
export const newContext = async (browser: Browser, options: { readonly userAgent?: string } = {}): Promise<{ context: BrowserContext; page: Page }> => {
  const context = await browser.newContext({ locale: 'it-IT', ...(options.userAgent ? { userAgent: options.userAgent } : {}) });
  await isolateClient(context);
  return { context, page: await context.newPage() };
};

/** The accept link of an invitation, from the email the invitee received (Mailpit). `inviter` is kept for the call sites. */
export const invitationLink = async (_inviter: Page, email: string): Promise<string> => {
  const mail = await waitForMail(email, { subject: /invit/i });
  return pathOf(linkIn(mail, /\/accept-invitation\//));
};
