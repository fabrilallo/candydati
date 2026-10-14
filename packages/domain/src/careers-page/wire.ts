import { z } from 'zod';
import { careersPageDocumentSchema } from './document.js';
import { careersMediaSchema, MEDIA_LIMITS } from './media.js';
import { optionalLocalizedSchema } from './localized.js';

const isoDate = z.iso.datetime({ offset: true });
const organizationSchema = z.object({ name: z.string(), slug: z.string(), logo: z.string().nullable() });

/** What the editor loads and gets back after each save or publish. */
export const careersPageEditorSchema = z.object({
  organization: organizationSchema,
  draft: careersPageDocumentSchema,
  /** Grows with every save and publication: a save or publish naming an older one is refused (`stale_revision`). */
  revision: z.number().int().nonnegative(),
  /** No page was ever saved: `draft` is the default page. */
  isDefault: z.boolean(),
  draftUpdatedAt: isoDate.nullable(),
  publishedAt: isoDate.nullable(),
  /** The draft differs from what visitors see. */
  hasUnpublishedChanges: z.boolean(),
});
export type CareersPageEditorDto = z.infer<typeof careersPageEditorSchema>;

/** Body of a draft save: the revision the editor started from and the whole document. */
export const careersDraftSaveSchema = z.object({ revision: z.number().int().nonnegative(), document: careersPageDocumentSchema });
export type CareersDraftSave = z.input<typeof careersDraftSaveSchema>;

/** Body of a publication: the revision of the draft the editor shows. */
export const careersPublishSchema = z.object({ revision: z.number().int().nonnegative() });

/** Error code of a save or publish over a draft someone else changed meanwhile (HTTP 409). */
export const CAREERS_STALE_REVISION = 'stale_revision';

/** The published page as visitors get it: visible sections only, and the media they use. */
export const publicCareersPageSchema = z.object({
  organization: organizationSchema,
  page: careersPageDocumentSchema,
  media: z.record(z.string(), careersMediaSchema),
  publishedAt: isoDate.nullable(),
});
export type PublicCareersPageDto = z.infer<typeof publicCareersPageSchema>;

/** The text fields that travel with an upload (multipart fields `alt.it`, `alt.en`). */
export const careersMediaUploadFieldsSchema = z.object({ alt: optionalLocalizedSchema(MEDIA_LIMITS.altMax).default({}) });

export const CAREERS_MEDIA_ERRORS = ['unsupported_type', 'too_large', 'empty', 'alt_required', 'image_unreadable', 'image_too_big', 'library_full'] as const;
export type CareersMediaError = (typeof CAREERS_MEDIA_ERRORS)[number];
