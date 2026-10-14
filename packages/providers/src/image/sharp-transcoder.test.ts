import { ImageRejectedError } from '@tt/core';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { createSharpImageTranscoder } from './sharp-transcoder.js';

const MARKER = 'secret-marker-123';
const widths = (original: number): readonly number[] => [640, 1280, 1920].filter((width) => width <= original || width === 640);

const photo = (width: number, height: number, options: { orientation?: number; exif?: boolean } = {}): Promise<Buffer> => {
  let image = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } } });
  if (options.exif) image = image.withExif({ IFD0: { Copyright: MARKER, ImageDescription: 'GPS 45.4642 N 9.19 E' } });
  if (options.orientation) image = image.withMetadata({ orientation: options.orientation });
  return image.jpeg().toBuffer();
};

describe('createSharpImageTranscoder', () => {
  const transcoder = createSharpImageTranscoder();

  it('re-encodes as WebP without any metadata', async () => {
    const source = await photo(1400, 700, { exif: true });
    expect(Buffer.from(source).includes(MARKER)).toBe(true);
    const result = await transcoder.transcode(source, widths);
    expect(result.variants.length).toBeGreaterThan(0);
    for (const variant of result.variants) {
      const meta = await sharp(variant.bytes).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.icc).toBeUndefined();
      expect(Buffer.from(variant.bytes).includes(MARKER)).toBe(false);
    }
  });

  it('produces the requested widths and never upscales', async () => {
    const result = await transcoder.transcode(await photo(1000, 500), () => [640, 1280, 1920]);
    expect(result).toMatchObject({ width: 1000, height: 500 });
    expect(result.variants.map((variant) => variant.width)).toEqual([640, 1280, 1920]);
    const actual = await Promise.all(result.variants.map(async (variant) => (await sharp(variant.bytes).metadata()).width));
    expect(actual).toEqual([640, 1000, 1000]);
  });

  it('applies the EXIF orientation and reports the oriented size', async () => {
    const source = await photo(800, 400, { orientation: 6 });
    expect(await transcoder.probe(source)).toEqual({ width: 400, height: 800 });
    const result = await transcoder.transcode(source, () => [200]);
    expect(result).toMatchObject({ width: 400, height: 800 });
    const meta = await sharp(result.variants[0]!.bytes).metadata();
    expect([meta.width, meta.height]).toEqual([200, 400]);
  });

  it('probes the header only and answers null for garbage', async () => {
    expect(await transcoder.probe(await photo(30, 20))).toEqual({ width: 30, height: 20 });
    expect(await transcoder.probe(new TextEncoder().encode('<svg></svg>'))).toBeNull();
  });

  it('rejects bytes that are not an image', async () => {
    const error = await transcoder.transcode(new Uint8Array([1, 2, 3, 4]), widths).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImageRejectedError);
    expect((error as ImageRejectedError).reason).toBe('image_unreadable');
  });

  it('rejects an image over the pixel limit', async () => {
    const small = createSharpImageTranscoder({ maxPixels: 1000 });
    const png = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#fff' } }).png().toBuffer();
    const error = await small.transcode(png, widths).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImageRejectedError);
    expect((error as ImageRejectedError).reason).toBe('image_too_big');
  });
});
