import { expect, type Page } from '@playwright/test';
import { makePng } from './files';
import { open } from './nav';
import { token } from './unique';

export interface CustomizedCareers {
  readonly headline: string;
  readonly galleryAlts: readonly string[];
}

const png = (seed: number): Buffer => makePng(1600, 1000, [20 + seed * 40, 60, 140], [230, 180 - seed * 30, 90]);

/** Uploads an image through the open picker dialog (alt text in Italian) and waits for the dialog to close. */
const uploadInPicker = async (page: Page, alt: string, seed: number): Promise<void> => {
  const dialog = page.getByTestId('careers-media-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('careers-media-file').setInputFiles({ name: `foto-${seed}.png`, mimeType: 'image/png', buffer: png(seed) });
  await dialog.getByTestId('careers-media-alt-it').fill(alt);
  await dialog.getByTestId('careers-media-upload').click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
};

/**
 * Through the editor: a hero with a new headline over an uploaded image, a gallery of two uploaded images with their
 * descriptions, then publish. The caller is signed in as an owner or admin.
 */
export const customizeCareersPage = async (page: Page): Promise<CustomizedCareers> => {
  const id = token();
  const headline = `Costruiamo cose belle ${id}`;
  const galleryAlts = [`Il team al lavoro ${id}`, `Pranzo del venerdì ${id}`];
  await open(page, '/app/settings/careers');
  await expect(page.getByTestId('careers-editor')).toBeVisible();

  await page.locator('[data-testid="careers-section-row"][data-section-type="hero"]').getByTestId('careers-section-select').click();
  await page.getByTestId('careers-field-headline').fill(headline);
  await page.getByTestId('careers-field-background-kind').selectOption('image');
  await page.getByTestId('careers-media-pick').click();
  await uploadInPicker(page, `Ufficio ${id}`, 0);

  await page.getByTestId('careers-add-section').click();
  await page.getByTestId('careers-add-gallery').click();
  for (const [index, alt] of galleryAlts.entries()) {
    // Adding opens the picker; the uploaded image's description becomes the item's.
    await page.getByTestId('careers-gallery-add').click();
    await uploadInPicker(page, alt, index + 1);
    await expect(page.getByTestId(`careers-field-gallery-alt-${index}`)).toHaveValue(alt);
  }
  await expect(page.getByTestId('careers-section-issues')).toHaveCount(0);
  await page.getByTestId('careers-publish').click();
  await expect(page.getByTestId('careers-published-at')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('careers-unpublished')).toHaveCount(0, { timeout: 30_000 });
  return { headline, galleryAlts };
};
