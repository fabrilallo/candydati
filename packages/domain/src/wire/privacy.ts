import { z } from 'zod';
import { dataExportStatusSchema } from '../candidate/retention.js';
import { SUPPORTED_LOCALES } from '../platform/config.js';
import { isoDate } from './common.js';

/** `{ erased: true }`: the answer of an erasure (and of a consent withdrawal that erased the application). */
export const erasedSchema = z.object({ erased: z.literal(true) });

const retentionDaysSchema = z.object({ selection: z.number().int().positive(), talent_pool: z.number().int().positive() });

/** `PrivacyNoticeDto` of `@candydati/core`'s candidate mapper. */
export const privacyNoticeSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  language: z.enum(SUPPORTED_LOCALES),
  text: z.string(),
  contactEmail: z.string(),
  retentionDays: retentionDaysSchema,
  createdAt: isoDate,
});
export type PrivacyNoticeDto = z.infer<typeof privacyNoticeSchema>;

/** What a candidate reads on the public page: no id, no author. */
export const publicPrivacyNoticeSchema = privacyNoticeSchema.pick({ version: true, language: true, text: true, contactEmail: true, retentionDays: true });
export type PublicPrivacyNoticeDto = z.infer<typeof publicPrivacyNoticeSchema>;

export const privacyTemplateSchema = z.object({ text: z.string() });

/** `toRetentionOverviewDto` of the api (a plain object, no named type): names are allowed, it is the controller's screen. */
export const retentionUpcomingSchema = z.object({
  applicationId: z.string(),
  candidateId: z.string(),
  candidateName: z.string(),
  /** Empty when the job is gone. */
  jobTitle: z.string(),
  retentionExpiresAt: isoDate,
});
export type RetentionUpcomingDto = z.infer<typeof retentionUpcomingSchema>;

export const retentionRunSchema = z.object({ id: z.string(), startedAt: isoDate, warned: z.number().int().nonnegative(), erased: z.number().int().nonnegative() });
export type RetentionRunDto = z.infer<typeof retentionRunSchema>;

export const retentionOverviewSchema = z.object({ upcoming: z.array(retentionUpcomingSchema), lastRuns: z.array(retentionRunSchema) });
export type RetentionOverviewDto = z.infer<typeof retentionOverviewSchema>;

/** `toDataExportDto`. "Expired" is not a status: a ready export past `expiresAt` reads as expired. */
export const dataExportSchema = z.object({
  id: z.string(),
  status: dataExportStatusSchema,
  sizeBytes: z.number().int().nonnegative().nullable(),
  createdAt: isoDate,
  completedAt: isoDate.nullable(),
  expiresAt: isoDate,
});
export type DataExportDto = z.infer<typeof dataExportSchema>;

/** `POST /exports` answers 202 with the id and the status only. */
export const dataExportCreatedSchema = z.object({ id: z.string(), status: dataExportStatusSchema });

/** `toProcessingRecordDto`: the providers are the instance's configured ones (`storage`, `email`, optional `model`). */
export const processingRecordSchema = z.object({
  organization: z.object({ name: z.string(), contactEmail: z.string().nullable() }),
  privacyNoticeVersion: z.number().int().positive().nullable(),
  retentionDays: retentionDaysSchema.nullable(),
  providers: z.object({ storage: z.string(), email: z.string(), model: z.string().nullable() }),
  generatedAt: isoDate,
});
export type ProcessingRecordDto = z.infer<typeof processingRecordSchema>;
