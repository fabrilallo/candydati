import { ImageRejectedError, type ImageTranscoder, type TranscodedImage } from '@candydati/core';
import { MEDIA_LIMITS } from '@candydati/domain';
import sharp, { type Metadata } from 'sharp';

const WEBP_OPTIONS = { quality: 80, effort: 4 } as const;
/** EXIF orientations 5 to 8 turn the picture a quarter: width and height swap. */
const SWAPS_SIDES = 5;

export interface SharpTranscoderOptions {
  /** Test seam: the decoded pixel cap. Defaults to `MEDIA_LIMITS.imageMaxPixels`. */
  readonly maxPixels?: number;
}

const rejection = (error: unknown): ImageRejectedError => {
  if (error instanceof ImageRejectedError) return error;
  const message = error instanceof Error ? error.message : '';
  return new ImageRejectedError(/pixel limit/i.test(message) ? 'image_too_big' : 'image_unreadable', { cause: error });
};

const orientedSize = ({ width, height, orientation }: Metadata): { width: number; height: number } => {
  if (!width || !height) throw new ImageRejectedError('image_unreadable');
  return (orientation ?? 1) >= SWAPS_SIDES ? { width: height, height: width } : { width, height };
};

const toBuffer = (bytes: Uint8Array): Buffer => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/**
 * Decodes every upload and re-encodes it as WebP: nothing of the original container survives. sharp drops EXIF, GPS,
 * XMP and ICC on output unless asked to keep them, and `withMetadata` / `keepMetadata` are deliberately never called.
 */
export function createSharpImageTranscoder(options: SharpTranscoderOptions = {}): ImageTranscoder {
  const maxPixels = options.maxPixels ?? MEDIA_LIMITS.imageMaxPixels;
  return {
    async probe(bytes) {
      try {
        // Header only: the pixel cap is enforced by the caller (and again by `transcode`), so a huge image is reported, not decoded.
        return orientedSize(await sharp(toBuffer(bytes), { limitInputPixels: false }).metadata());
      } catch {
        return null;
      }
    },
    async transcode(bytes, widthsFor): Promise<TranscodedImage> {
      try {
        const source = sharp(toBuffer(bytes), { limitInputPixels: maxPixels, failOn: 'error', animated: false });
        const { width, height } = orientedSize(await source.metadata());
        if (width * height > maxPixels) throw new ImageRejectedError('image_too_big');
        // Auto-orient first: the orientation tag is metadata, and it is gone from the output.
        const oriented = source.rotate();
        const variants = await Promise.all(
          widthsFor(width).map(async (target) => ({
            width: target,
            bytes: new Uint8Array(await oriented.clone().resize({ width: target, withoutEnlargement: true }).webp(WEBP_OPTIONS).toBuffer()),
          })),
        );
        return { width, height, variants };
      } catch (error) {
        throw rejection(error);
      }
    },
  };
}
