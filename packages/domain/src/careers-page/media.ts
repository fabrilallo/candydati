import { z } from 'zod';
import { optionalLocalizedSchema } from './localized.js';

/**
 * Images and videos of a careers page. The type of an upload is decided from its first bytes, never from its name or
 * declared type. Images are re-encoded (metadata, EXIF and GPS included, never survive); videos are stored as they are.
 * The page references media by id: a URL is never taken from the client.
 */
export const MEDIA_KINDS = ['image', 'video'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const IMAGE_SOURCE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;
export const VIDEO_TYPES = ['video/mp4', 'video/webm'] as const;
export type ImageSourceType = (typeof IMAGE_SOURCE_TYPES)[number];
export type VideoType = (typeof VIDEO_TYPES)[number];
export type SniffedMediaType = ImageSourceType | VideoType;

/** Every image is served as WebP, in these widths (never wider than the original). */
export const IMAGE_OUTPUT_TYPE = 'image/webp';
export const IMAGE_WIDTHS = [640, 1280, 1920] as const;

export const MEDIA_LIMITS = {
  imageMaxBytes: 8 * 1024 * 1024,
  videoMaxBytes: 60 * 1024 * 1024,
  /** Larger sides are scaled down: a 100 megapixel bomb is refused before it is decoded. */
  imageMaxPixels: 50_000_000,
  /** Per organization, so a careers page cannot become free storage. */
  assetsPerOrganization: 200,
  altMax: 200,
} as const;

const startsWith = (bytes: Uint8Array, magic: readonly number[], offset = 0): boolean => magic.every((value, index) => bytes[offset + index] === value);
const ascii = (bytes: Uint8Array, from: number, to: number): string => String.fromCharCode(...bytes.subarray(from, to));

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const EBML = [0x1a, 0x45, 0xdf, 0xa3];
const AVIF_BRANDS = new Set(['avif', 'avis']);
const MP4_BRANDS = new Set(['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash', 'mmp4']);

/** ISO base media file (`....ftyp<brand>`): AVIF and MP4 share the container and differ by brand. */
function sniffFtyp(bytes: Uint8Array): SniffedMediaType | null {
  if (bytes.length < 12 || ascii(bytes, 4, 8) !== 'ftyp') return null;
  const size = ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0;
  const end = Math.min(bytes.length, Math.max(16, size));
  const brands = [ascii(bytes, 8, 12), ...Array.from({ length: Math.max(0, Math.floor((end - 16) / 4)) }, (_, index) => ascii(bytes, 16 + index * 4, 20 + index * 4))];
  if (AVIF_BRANDS.has(brands[0]!)) return 'image/avif';
  if (brands.some((brand) => MP4_BRANDS.has(brand))) return 'video/mp4';
  return null;
}

/** The media type from the content alone, or null when it is none of the accepted ones. */
export function sniffMediaType(bytes: Uint8Array): SniffedMediaType | null {
  if (startsWith(bytes, JPEG)) return 'image/jpeg';
  if (startsWith(bytes, PNG)) return 'image/png';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
  if (startsWith(bytes, EBML) && ascii(bytes, 0, Math.min(bytes.length, 64)).includes('webm')) return 'video/webm';
  return sniffFtyp(bytes);
}

export const mediaKindOf = (type: SniffedMediaType): MediaKind => (type.startsWith('image/') ? 'image' : 'video');

export const maxBytesOf = (kind: MediaKind): number => (kind === 'image' ? MEDIA_LIMITS.imageMaxBytes : MEDIA_LIMITS.videoMaxBytes);

/** The widths an image of `width` pixels is served in: the standard ones below it, plus its own when it is narrower than the largest. */
export const imageWidthsFor = (width: number): readonly number[] => {
  const largest = IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]!;
  if (width >= largest) return [...IMAGE_WIDTHS];
  return [...IMAGE_WIDTHS.filter((candidate) => candidate < width), width];
};

const extensionOf = (mime: string): string => (mime === 'video/webm' ? 'webm' : mime === 'video/mp4' ? 'mp4' : 'webp');

/** File name of one stored variant: content addressed (the hash of the original), so a URL never changes meaning. */
export const mediaFileName = (hash: string, mime: string, width: number | null): string =>
  width === null ? `${hash.slice(0, 16)}.${extensionOf(mime)}` : `${hash.slice(0, 16)}-w${width}.${extensionOf(mime)}`;

const FILE_NAME = /^[0-9a-f]{16}(?:-w\d{2,4})?\.(?:webp|mp4|webm)$/;
export const isMediaFileName = (value: string): boolean => FILE_NAME.test(value);

/** Storage key of a file of an asset; under the organization's prefix, like every other file. */
export const careersMediaKey = (organizationId: string, assetId: string, fileName: string): string =>
  `organizations/${organizationId}/careers-media/${assetId}/${fileName}`;

/** Public, same-origin path of a file (served through the web proxy with long immutable caching). */
export const careersMediaPath = (organizationSlug: string, assetId: string, fileName: string): string =>
  `/api/v1/public/organizations/${encodeURIComponent(organizationSlug)}/careers-media/${encodeURIComponent(assetId)}/${encodeURIComponent(fileName)}`;

/**
 * Path of a file for the editor (library, draft, preview): session only, checked against `careers_page:manage` and the
 * organization, never cached by shared caches. Only files of the published page get the public path.
 */
export const careersMediaPrivatePath = (assetId: string, fileName: string): string =>
  `/api/v1/careers-page/media/${encodeURIComponent(assetId)}/files/${encodeURIComponent(fileName)}`;

export const mediaIdSchema = z.uuid();

const variantSchema = z.object({ width: z.number().int().positive(), url: z.string() });

/** A media file as the page renders it. `variants` are the image widths (empty for a video, whose `url` is the file). */
export const careersMediaSchema = z.object({
  id: z.string(),
  kind: z.enum(MEDIA_KINDS),
  mime: z.string(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  url: z.string(),
  variants: z.array(variantSchema),
});
export type CareersMediaDto = z.infer<typeof careersMediaSchema>;

/** A media file in the editor's library: what the page shows plus size, default description and where it is used. */
export const careersMediaAssetSchema = careersMediaSchema.extend({
  sizeBytes: z.number().int().nonnegative(),
  alt: optionalLocalizedSchema(MEDIA_LIMITS.altMax),
  createdAt: z.iso.datetime({ offset: true }),
  usedInDraft: z.boolean(),
  usedInPublished: z.boolean(),
});
export type CareersMediaAssetDto = z.infer<typeof careersMediaAssetSchema>;
