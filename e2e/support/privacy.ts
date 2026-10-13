import { expect, type Page } from '@playwright/test';
import { open } from './nav';

/** Publishes the first privacy notice of the organization from the settings page (template text). */
export const publishPrivacyNotice = async (page: Page, contactEmail: string): Promise<void> => {
  await open(page, '/app/settings/privacy');
  const editor = page.getByTestId('privacy-editor');
  await expect(editor).toBeVisible();
  await page.getByTestId('use-template').click();
  await page.getByRole('dialog').getByRole('button').last().click();
  await expect(page.getByTestId('privacy-text-input')).not.toHaveValue('');
  await page.getByTestId('privacy-contact').fill(contactEmail);
  await page.getByTestId('privacy-selection').fill('365');
  await page.getByTestId('privacy-pool').fill('730');
  await page.getByTestId('privacy-publish').click();
  const saved = page.waitForResponse((r) => r.url().includes('/api/v1/privacy-notice') && r.request().method() === 'POST');
  await page.getByRole('dialog').getByRole('button', { name: 'Pubblica', exact: true }).click();
  const response = await saved;
  expect(response.status(), await response.text()).toBeLessThan(300);
  await expect(page.getByTestId('privacy-publish')).toContainText('versione 2');
};
