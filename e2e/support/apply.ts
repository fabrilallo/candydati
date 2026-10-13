import { expect, type Page } from '@playwright/test';
import { makePdf } from './files';
import { open } from './nav';

export interface Applicant {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
}

/** Applies from the public ad page with a generated PDF and both consents; resolves once the confirmation shows. */
export const applyToJob = async (page: Page, orgSlug: string, jobSlug: string, who: Applicant): Promise<void> => {
  await open(page, `/careers/${orgSlug}/${jobSlug}`);
  await page.getByTestId('apply-cta').click();
  await page.locator('#apply-first-name').fill(who.firstName);
  await page.locator('#apply-last-name').fill(who.lastName);
  await page.locator('#apply-email').fill(who.email);
  await page.getByTestId('cv-input').setInputFiles({
    name: `cv-${who.lastName}.pdf`,
    mimeType: 'application/pdf',
    buffer: makePdf([`${who.firstName} ${who.lastName}`, who.email, 'Backend developer, 6 anni di esperienza con TypeScript e Postgres']),
  });
  await expect(page.getByTestId('cv-file')).toBeVisible();
  await page.getByTestId('consent-selection').check();
  await page.getByTestId('consent-pool').check();
  await page.getByTestId('apply-submit').click();
  await expect(page.getByTestId('apply-success')).toBeVisible();
};
