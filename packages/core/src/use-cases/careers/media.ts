import {
  careersMediaKey,
  hasText,
  imageWidthsFor,
  IMAGE_OUTPUT_TYPE,
  maxBytesOf,
  MEDIA_LIMITS,
  mediaFileName,
  mediaKindOf,
  optionalLocalizedSchema,
  sniffMediaType,
  type CareersMediaAssetDto,
  type CareersMediaError,
} from '@tt/domain';
import { z } from 'zod';
import type { Actor } from '../../actor.js';
import { ImageRejectedError, type CareersDeps, type CareersMediaRecord } from '../../careers-ports.js';
import { NotFoundError, ValidationError } from '../../errors.js';
import { baseDeps } from '../../transaction.js';
import { deleteFilesAfterErasure } from '../privacy/erase-candidate-data.js';
import { defineCareersUseCase } from './define.js';
import { mediaFileInput, openMediaFile, type CareersMediaFile } from './media-file.js';
import { referencedIds, requireOrganizationById, toMediaAssetDto } from './shared.js';

const refuse = (message: CareersMediaError): never => {
  throw new ValidationError([{ path: 'file', message }]);
};

interface StoredFile {
  readonly key: string;
  readonly bytes: Uint8Array;
  readonly mime: string;
}

interface Prepared {
  readonly record: CareersMediaRecord;
  readonly files: readonly StoredFile[];
}

const usageOf = async (deps: CareersDeps, organizationId: string) => {
  const page = await deps.careersPages.find(organizationId);
  return { draft: referencedIds(page?.draft ?? null), published: referencedIds(page?.published ?? null) };
};

async function transcodeImage(deps: CareersDeps, bytes: Uint8Array) {
  const size = await deps.images.probe(bytes);
  if (!size) return refuse('image_unreadable');
  if (size.width * size.height > MEDIA_LIMITS.imageMaxPixels) return refuse('image_too_big');
  try {
    return await deps.images.transcode(bytes, imageWidthsFor);
  } catch (error) {
    if (error instanceof ImageRejectedError) return refuse(error.reason);
    throw error;
  }
}

/** Decides the type from the bytes, checks the limits and turns the upload into the files to store. */
async function prepare(deps: CareersDeps, actor: Actor, input: z.output<typeof uploadInput>): Promise<Prepared> {
  if (input.bytes.byteLength === 0) refuse('empty');
  const type = sniffMediaType(input.bytes) ?? refuse('unsupported_type');
  const kind = mediaKindOf(type);
  if (input.bytes.byteLength > maxBytesOf(kind)) refuse('too_large');
  if (kind === 'image' && !hasText(input.alt)) refuse('alt_required');
  const id = deps.newId();
  const sha256 = deps.sha256(input.bytes);
  const base = { id, organizationId: actor.organizationId, kind, sizeBytes: input.bytes.byteLength, sha256, alt: input.alt, createdBy: actor.id ?? 'system', createdAt: deps.now() };
  const keyOf = (mime: string, width: number | null) => careersMediaKey(actor.organizationId, id, mediaFileName(sha256, mime, width));
  if (kind === 'video') {
    return { record: { ...base, mime: type, width: null, height: null, widths: [] }, files: [{ key: keyOf(type, null), bytes: input.bytes, mime: type }] };
  }
  const image = await transcodeImage(deps, input.bytes);
  const files = image.variants.map((variant) => ({ key: keyOf(IMAGE_OUTPUT_TYPE, variant.width), bytes: variant.bytes, mime: IMAGE_OUTPUT_TYPE }));
  return { record: { ...base, mime: IMAGE_OUTPUT_TYPE, width: image.width, height: image.height, widths: image.variants.map((variant) => variant.width) }, files };
}

const uploadInput = z.object({
  bytes: z.instanceof(Uint8Array),
  alt: optionalLocalizedSchema(MEDIA_LIMITS.altMax).default({}),
});

/**
 * Adds an image or a video to the organization's library. The type comes from the bytes (JPEG, PNG, WebP, AVIF; MP4,
 * WebM); images are decoded and re-encoded as WebP at each width, which drops every metadata block (EXIF, GPS, XMP);
 * videos are stored as uploaded. Files are written before the row, and removed again if the row cannot be.
 */
export const uploadCareersMedia = defineCareersUseCase({
  name: 'uploadCareersMedia',
  input: uploadInput,
  permission: 'careers_page:manage',
  audit: {
    action: 'careers_media.uploaded',
    target: (_input, result: CareersMediaAssetDto) => ({ type: 'careers_media', id: result.id }),
    metadata: (_input, result: CareersMediaAssetDto) => ({ kind: result.kind, sizeBytes: result.sizeBytes }),
  },
  transaction: { skip: 'stores the files first (long), then writes the row; the files are removed when the row fails' },
  handler: async ({ deps, actor, input }): Promise<CareersMediaAssetDto> => {
    await requireOrganizationById(deps, actor.organizationId);
    if ((await deps.careersMedia.count(actor.organizationId)) >= MEDIA_LIMITS.assetsPerOrganization) refuse('library_full');
    const { record, files } = await prepare(deps, actor, input);
    const written: string[] = [];
    try {
      for (const file of files) {
        await deps.files.put(file.key, file.bytes, file.mime);
        written.push(file.key);
      }
      const stored = await deps.careersMedia.insert(record);
      return toMediaAssetDto(stored, { draft: new Set(), published: new Set() });
    } catch (error) {
      await deleteFilesAfterErasure(deps, actor.organizationId, written);
      throw error;
    }
  },
});

/** The library, newest first, with where each file is used. */
export const listCareersMedia = defineCareersUseCase({
  name: 'listCareersMedia',
  input: z.object({}),
  permission: 'careers_page:manage',
  audit: { skip: 'read of the organization library, no personal data' },
  handler: async ({ deps, actor }): Promise<readonly CareersMediaAssetDto[]> => {
    await requireOrganizationById(deps, actor.organizationId);
    const [records, usage] = [await deps.careersMedia.list(actor.organizationId, MEDIA_LIMITS.assetsPerOrganization), await usageOf(deps, actor.organizationId)];
    return records.map((record) => toMediaAssetDto(record, usage));
  },
});

const fileKeysOf = (record: CareersMediaRecord): readonly string[] =>
  record.kind === 'video'
    ? [careersMediaKey(record.organizationId, record.id, mediaFileName(record.sha256, record.mime, null))]
    : record.widths.map((width) => careersMediaKey(record.organizationId, record.id, mediaFileName(record.sha256, record.mime, width)));

/**
 * Removes a file from the library and from storage (after the commit; a failed deletion is retried by the worker).
 * Refused while the published page or the draft uses it: visitors would get a broken page, the editor a draft it
 * cannot save.
 */
export const deleteCareersMedia = defineCareersUseCase({
  name: 'deleteCareersMedia',
  input: z.object({ mediaId: z.string().min(1).max(64) }),
  permission: 'careers_page:manage',
  audit: { action: 'careers_media.deleted', target: (input) => ({ type: 'careers_media', id: input.mediaId }) },
  handler: async ({ deps, actor, input }): Promise<{ readonly id: string }> => {
    const record = await deps.careersMedia.findById(actor.organizationId, input.mediaId);
    if (!record) throw new NotFoundError('Media not found.');
    const usage = await usageOf(deps, actor.organizationId);
    if (usage.published.has(record.id)) throw new ValidationError([{ path: 'mediaId', message: 'in_published_page' }]);
    if (usage.draft.has(record.id)) throw new ValidationError([{ path: 'mediaId', message: 'in_draft' }]);
    await deps.careersMedia.delete(actor.organizationId, record.id);
    const base = baseDeps(deps);
    deps.afterCommit?.(async () => {
      await deleteFilesAfterErasure(base, actor.organizationId, fileKeysOf(record));
    });
    return { id: record.id };
  },
});

/**
 * A file of the library for the editor (thumbnails, draft preview), whatever the page uses: owners and admins of its
 * organization only. Read-only; not audited (no personal data, like listing the library).
 */
export const getCareersMediaFile = defineCareersUseCase({
  name: 'getCareersMediaFile',
  input: z.object(mediaFileInput),
  permission: 'careers_page:manage',
  audit: { skip: 'read of an organization media file, no personal data' },
  handler: async ({ deps, actor, input }): Promise<CareersMediaFile> =>
    openMediaFile(deps, await deps.careersMedia.findById(actor.organizationId, input.mediaId), input.fileName, input.range),
});
