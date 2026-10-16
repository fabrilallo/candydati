import type { CareersPageDocument, LocalizedText, MediaKind } from '@candydati/domain';
import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';

/**
 * The careers page of an organization: the draft the editor saves and the version visitors see. One row per
 * organization, absent until someone saves (the default page is computed). Both documents are validated with
 * `careersPageDocumentSchema` when written and again when read: jsonb is a boundary.
 */
export const careersPage = pgTable('careers_page', {
  organizationId: text('organization_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'restrict' }),
  draft: jsonb('draft').$type<CareersPageDocument>().notNull(),
  published: jsonb('published').$type<CareersPageDocument>(),
  /** Grows by one with every save and publication: the editor's optimistic lock. */
  revision: integer('revision').notNull().default(0),
  draftUpdatedAt: timestamp('draft_updated_at', { withTimezone: true }).notNull(),
  draftUpdatedBy: text('draft_updated_by').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  publishedBy: text('published_by'),
});

/**
 * Images and videos uploaded for the careers page. The files live in object storage under
 * `organizations/<org>/careers-media/<id>/`, named after the hash of the original (`file_names`); images are stored
 * re-encoded as WebP in one file per width, videos as uploaded.
 */
export const careersMedia = pgTable(
  'careers_media',
  {
    id: text('id').notNull(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    kind: text('kind').$type<MediaKind>().notNull(),
    /** Type of the stored files (`image/webp`, `video/mp4`, `video/webm`). */
    mime: text('mime').notNull(),
    /** Bytes of what was uploaded. */
    sizeBytes: integer('size_bytes').notNull(),
    width: integer('width'),
    height: integer('height'),
    /** SHA-256 of the uploaded bytes, hex. */
    sha256: text('sha256').notNull(),
    /** Widths stored for an image (ascending); empty for a video. */
    widths: jsonb('widths').$type<readonly number[]>().notNull().default(sql`'[]'::jsonb`),
    /** Default description, per language, proposed when the image is placed on the page. */
    alt: jsonb('alt').$type<LocalizedText>().notNull().default(sql`'{}'::jsonb`),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    index('careers_media_org_created_idx').on(table.organizationId, table.createdAt),
    check('careers_media_kind_check', sql`${table.kind} in ('image', 'video')`),
  ],
);

export type CareersPageRow = typeof careersPage.$inferSelect;
export type CareersMediaRow = typeof careersMedia.$inferSelect;
