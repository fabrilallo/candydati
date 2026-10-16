import type { CareersPageDocument, Locale, LocalizedText, MediaKind } from '@candydati/domain';
import type { FileStorage, TaskQueue } from './intake-ports.js';
import type { OrganizationDirectory } from './job-ports.js';
import type { CoreDeps } from './ports.js';

/** The stored careers page of an organization. Both documents were validated when read. */
export interface CareersPageRecord {
  readonly organizationId: string;
  readonly draft: CareersPageDocument;
  readonly published: CareersPageDocument | null;
  /** Optimistic lock: grows by one with every save and publication. 0 = never saved. */
  readonly revision: number;
  readonly draftUpdatedAt: Date;
  readonly publishedAt: Date | null;
}

/** Always filtered by organization. Adapters validate the documents with `careersPageDocumentSchema` on read and write. */
export interface CareersPageRepository {
  find(organizationId: string): Promise<CareersPageRecord | null>;
  /** Null when the stored revision is not `expectedRevision` (someone saved meanwhile): nothing is written then. */
  saveDraft(organizationId: string, draft: CareersPageDocument, at: Date, userId: string, expectedRevision: number): Promise<CareersPageRecord | null>;
  /** Makes `document` the published version and the draft at once. Null when the revision is stale, like `saveDraft`. */
  publish(organizationId: string, document: CareersPageDocument, at: Date, userId: string, expectedRevision: number): Promise<CareersPageRecord | null>;
}

export interface CareersMediaRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly kind: MediaKind;
  /** Type of the stored files. */
  readonly mime: string;
  readonly sizeBytes: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly sha256: string;
  /** Widths stored for an image, ascending; empty for a video. */
  readonly widths: readonly number[];
  readonly alt: LocalizedText;
  readonly createdBy: string;
  readonly createdAt: Date;
}

export interface CareersMediaRepository {
  insert(record: CareersMediaRecord): Promise<CareersMediaRecord>;
  findById(organizationId: string, id: string): Promise<CareersMediaRecord | null>;
  findByIds(organizationId: string, ids: readonly string[]): Promise<readonly CareersMediaRecord[]>;
  /** Newest first. */
  list(organizationId: string, limit: number): Promise<readonly CareersMediaRecord[]>;
  count(organizationId: string): Promise<number>;
  /** False when there was nothing to delete. */
  delete(organizationId: string, id: string): Promise<boolean>;
}

/** An image decoded, stripped of every metadata block and re-encoded as WebP at each width. */
export interface TranscodedImage {
  readonly width: number;
  readonly height: number;
  readonly variants: readonly { readonly width: number; readonly bytes: Uint8Array }[];
}

/** Implemented with sharp in `@candydati/providers`. Throws `ImageRejectedError` for an image it will not decode. */
export interface ImageTranscoder {
  /** Width and height as the file declares them, read from the header only (no decoding). Null when unreadable. */
  probe(bytes: Uint8Array): Promise<{ readonly width: number; readonly height: number } | null>;
  transcode(bytes: Uint8Array, widths: (originalWidth: number) => readonly number[]): Promise<TranscodedImage>;
}

/** The transcoder could not or would not decode the image (corrupt, unsupported, decompression bomb). */
export class ImageRejectedError extends Error {
  constructor(readonly reason: 'image_unreadable' | 'image_too_big', options?: ErrorOptions) {
    super(`Image rejected: ${reason}`, options);
    this.name = 'ImageRejectedError';
  }
}

export interface CareersDeps extends CoreDeps {
  readonly careersPages: CareersPageRepository;
  readonly careersMedia: CareersMediaRepository;
  readonly organizations: OrganizationDirectory;
  readonly files: FileStorage;
  /** `files.delete` tasks for files whose deletion failed after their row was gone. */
  readonly queue: TaskQueue;
  readonly images: ImageTranscoder;
  /** SHA-256 of bytes, lower-case hex. */
  readonly sha256: (bytes: Uint8Array) => string;
  /** Language of the default page of an organization that never saved one. */
  readonly defaultLocale: Locale;
  readonly newId: () => string;
  readonly now: () => Date;
}

/** What the visitors' reads need: no write, no actor. */
export type PublicCareersDeps = Pick<CareersDeps, 'careersPages' | 'careersMedia' | 'organizations' | 'files' | 'defaultLocale'>;
