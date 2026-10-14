import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import sharp from 'sharp';

export const SCREENSHOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/assets/screenshots');

/** No caret, no transitions, no toasts, no dev-only overlays: what a person sees once the page is still. */
const STILL_CSS = `
  *, *::before, *::after { transition: none !important; animation-duration: 0s !important; animation-delay: 0s !important; caret-color: transparent !important; }
  [data-sonner-toaster], [data-sonner-toast], nuxt-devtools-frame, #nuxt-devtools-container, .nuxt-devtools-panel { display: none !important; }
`;

/** Waits for fonts, images and two quiet frames; drops focus and moves the pointer out of the way. */
export const settle = async (page: Page): Promise<void> => {
  await page.addStyleTag({ content: STILL_CSS });
  await page.mouse.move(1, 1);
  await page.evaluate(async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    await document.fonts.ready;
    const images = Array.from(document.images).filter((image) => image.loading !== 'lazy' || image.getBoundingClientRect().top < window.innerHeight);
    await Promise.all(images.map((image) => (image.complete ? Promise.resolve() : new Promise((done) => image.addEventListener('load', done, { once: true })))));
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(400);
};

export interface Clip {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** README images stay light: a photographic page that will not fit as a 2x palette PNG is scaled to 1.5x. */
const MAX_BYTES = 600_000;
/** Tried in order until one fits: full 2x, then 1.5x, then 1.5x without dithering, then 1x. */
const ATTEMPTS = [
  { scale: 1, colours: 256, dither: 1 },
  { scale: 0.75, colours: 256, dither: 1 },
  { scale: 0.75, colours: 256, dither: 0 },
  { scale: 0.5, colours: 256, dither: 0 },
] as const;

const encode = (input: Buffer, width: number, colours: number, dither: number): Promise<Buffer> =>
  sharp(input).resize({ width }).png({ compressionLevel: 9, palette: true, quality: 90, colours, dither, effort: 10 }).toBuffer();

const compress = async (raw: Buffer): Promise<Buffer> => {
  const { width = 0 } = await sharp(raw).metadata();
  let last = raw;
  for (const { scale, colours, dither } of ATTEMPTS) {
    last = await encode(raw, Math.round(width * scale), colours, dither);
    if (last.length <= MAX_BYTES) return last;
  }
  return last;
};

/** Captures the viewport (or a clip), quantizes it to a palette PNG and writes it under docs/assets/screenshots. */
export const capture = async (page: Page, name: string, clip?: Clip): Promise<{ path: string; bytes: number }> => {
  await settle(page);
  const raw = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide', ...(clip ? { clip, fullPage: true } : {}) });
  const png = await compress(raw);
  const path = resolve(SCREENSHOT_DIR, `${name}.png`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, png);
  return { path, bytes: png.length };
};
