import { expect, test } from '../support/test';
import { customizeCareersPage } from '../support/careers';
import { closeClient } from '../support/client';
import { load } from '../support/nav';
import { workspaceWithJob } from '../support/scenario';
import { newContext } from '../support/session';

/** An admin customizes the hero and adds a gallery in the builder, publishes, and a visitor sees it on the careers page. */
test('careers page builder: customize, publish, visit', async ({ browser }) => {
  test.setTimeout(6 * 60_000);
  const owner = await newContext(browser);
  try {
    const workspace = await workspaceWithJob(owner.page);
    const before = await newContext(browser);
    try {
      await load(before.page, `/careers/${workspace.org.slug}`);
      await expect(before.page.locator('h1')).toContainText(workspace.org.name);
    } finally {
      await closeClient(before.context);
    }

    const { headline, galleryAlts } = await customizeCareersPage(owner.page);
    // The live preview renders the same page.
    await expect(owner.page.getByTestId('careers-preview').locator('h1')).toHaveText(headline);
    // The editor reads the library through its private route, never the public one.
    await expect(owner.page.getByTestId('careers-preview').locator('[data-testid="site-hero-image"]')).toHaveAttribute('src', /^\/api\/v1\/careers-page\/media\//);

    const visitor = await newContext(browser);
    try {
      const { page } = visitor;
      await load(page, `/careers/${workspace.org.slug}`);
      await expect(page.locator('h1')).toHaveText(headline);
      const hero = page.getByTestId('site-hero-image');
      await expect(hero).toHaveAttribute('fetchpriority', 'high');
      await expect.poll(() => hero.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      const gallery = page.getByTestId('site-gallery').locator('img');
      await expect(gallery).toHaveCount(2);
      expect(await gallery.evaluateAll((images) => images.map((image) => image.getAttribute('alt')))).toEqual(galleryAlts);
      // Media is served from our origin, re-encoded, with immutable caching.
      const response = await page.request.get((await hero.getAttribute('src')) ?? '');
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toBe('image/webp');
      expect(response.headers()['cache-control']).toContain('immutable');
      // The open positions keep salary and stages, never the response time.
      await expect(page.getByTestId('careers-job')).toHaveCount(1);
      await expect(page.getByTestId('site-jobs')).not.toContainText(/risposta/i);
      await page.getByTestId('site-hero-cta').click();
      await expect(page).toHaveURL(/#posizioni$/);
      // Phone width: no horizontal scroll.
      await page.setViewportSize({ width: 360, height: 780 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    } finally {
      await closeClient(visitor.context);
    }
  } finally {
    await closeClient(owner.context);
  }
});

/**
 * An owner's sidebar has more items than a short laptop screen is tall: the menu scrolls inside itself and the footer
 * (public careers page, user menu) stays whole at the bottom, never drawn over the items.
 */
test('the app sidebar and the editor fit a short laptop screen', async ({ browser }) => {
  const owner = await newContext(browser);
  try {
    await owner.page.setViewportSize({ width: 1280, height: 720 });
    await workspaceWithJob(owner.page);
    await load(owner.page, '/app/settings/careers');
    const panel = owner.page.getByTestId('nav-panel');
    const nav = panel.locator('nav');
    const footer = panel.getByTestId('nav-footer');
    const [navBox, footerBox] = [await nav.boundingBox(), await footer.boundingBox()];
    expect(navBox && footerBox).toBeTruthy();
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(720 + 1);
    expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(footerBox!.y + 1);
    expect(await nav.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    // The editor column holds its section rows: nothing spills under the preview.
    await owner.page.getByTestId('careers-section-row').first().waitFor();
    const form = owner.page.getByTestId('careers-editor-form');
    expect(await form.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  } finally {
    await closeClient(owner.context);
  }
});
