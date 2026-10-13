import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { linkIn, messagesTo } from './mailpit';
import { identity, orgIdentity, type Identity } from './unique';
import { PASSWORD } from './env';
import { isolateClient } from './client';
import { hydrated, load } from './nav';

export interface Workspace {
  readonly owner: Identity;
  readonly org: { readonly name: string; readonly slug: string };
}

/** Signs up through the UI and lands on onboarding. */
export const signUp = async (page: Page, who: Identity): Promise<void> => {
  await load(page, '/signup');
  await page.locator('#name').fill(who.name);
  await page.locator('#email').fill(who.email);
  await page.locator('#password').fill(who.password);
  await page.locator('form button[type=submit]').click();
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
export const newContext = async (browser: Browser): Promise<{ context: BrowserContext; page: Page }> => {
  const context = await browser.newContext({ locale: 'it-IT' });
  await isolateClient(context);
  return { context, page: await context.newPage() };
};

/**
 * The accept link of an invitation. This stack logs invitations instead of emailing them (`createLogEmailSender`),
 * so, unless a mail with the link exists, it is read from the inviter's own organization through the auth api,
 * the same data the accept page uses: `/accept-invitation/{id}`.
 */
export const invitationLink = async (inviter: Page, email: string): Promise<string> => {
  const [mail] = await messagesTo(email);
  if (mail) {
    const response = await fetch(`${process.env.MAILPIT_URL ?? 'http://localhost:8025'}/api/v1/message/${mail.ID}`);
    return linkIn((await response.json()) as never, /accept-invitation\//);
  }
  const body = await inviter.evaluate(async () => {
    const response = await fetch('/api/auth/organization/get-full-organization', { credentials: 'same-origin' });
    return (await response.json()) as { invitations?: { id: string; email: string; status: string }[] };
  });
  const invitation = body.invitations?.find((i) => i.email === email && i.status === 'pending');
  if (!invitation) throw new Error(`No pending invitation for ${email}`);
  return `/accept-invitation/${invitation.id}`;
};
