import { CONSENT_SCOPES, IMPORT_CONFIDENCES, IMPORT_FLAGS, IMPORT_ITEM_STATUSES, IMPORT_STATUSES, SUPPORTED_LOCALES, importMappingSchema } from '@tt/domain';
import type { ConsentRequestDto } from '@tt/core';
import { z } from 'zod';

const isoDate = z.iso.datetime();

const counts = z.object({
  files: z.number().int(),
  cvs: z.number().int(),
  rows: z.number().int(),
  items: z.number().int(),
  included: z.number().int(),
  imported: z.number().int(),
  merged: z.number().int(),
  failed: z.number().int(),
  noEmail: z.number().int(),
  emailsQueued: z.number().int(),
  skippedReconfirmed: z.number().int(),
  erased: z.number().int(),
});

export const importBatchSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  stageId: z.string(),
  status: z.enum(IMPORT_STATUSES),
  counts,
  mapping: importMappingSchema.nullable(),
  headers: z.array(z.string()),
  error: z.string().nullable(),
  createdAt: isoDate,
  importedAt: isoDate.nullable(),
  undoneAt: isoDate.nullable(),
  job: z.object({ id: z.string(), title: z.string() }).nullable(),
  createdBy: z.object({ id: z.string(), name: z.string() }),
  columnSamples: z.record(z.string(), z.array(z.string())).optional().describe('First non-empty values of each column (preview only).'),
});

const proposedCandidate = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  tags: z.array(z.string()),
  note: z.string().nullable(),
});

const importItem = z.object({
  id: z.string(),
  position: z.number().int(),
  included: z.boolean(),
  status: z.enum(IMPORT_ITEM_STATUSES),
  error: z.string().nullable(),
  confidence: z.enum(IMPORT_CONFIDENCES),
  basis: z.enum(['email', 'file_name', 'name', 'fuzzy_name', 'single']),
  candidate: proposedCandidate,
  cv: z.object({ fileName: z.string(), key: z.string() }).nullable(),
  headline: z.string().nullable(),
  sources: z.object({ rows: z.array(z.number().int()), files: z.array(z.string()) }),
  existing: z.object({ id: z.string(), firstName: z.string(), lastName: z.string() }).nullable(),
  conflicts: z.array(z.object({ field: z.enum(['email', 'phone', 'name', 'linkedinUrl']), kind: z.enum(['sources', 'existing']), kept: z.string(), other: z.string() })),
  flags: z.array(z.enum(IMPORT_FLAGS)),
});

export const importBatchPageSchema = z.object({
  batch: importBatchSchema,
  items: z.array(importItem),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});

export const undoImportSchema = z.object({
  batch: importBatchSchema,
  erased: z.number().int(),
  skippedReconfirmed: z.number().int(),
  failed: z.number().int(),
});

export const consentRequestSchema: z.ZodType<ConsentRequestDto> = z.object({
  organization: z.object({ name: z.string(), slug: z.string() }),
  job: z.object({ title: z.string() }),
  privacyNotice: z.object({
    version: z.number().int(),
    language: z.enum(SUPPORTED_LOCALES),
    text: z.string(),
    contactEmail: z.string(),
    retentionDays: z.object({ selection: z.number().int(), talent_pool: z.number().int() }),
  }),
  expiresAt: isoDate,
});

export const consentAnswerBody = z.object({
  scopes: z.array(z.enum(CONSENT_SCOPES)).optional(),
  privacyNoticeVersion: z.number().int().positive().optional(),
  decline: z.boolean().optional(),
});

export const importUploadBody = z.object({
  jobId: z.string(),
  stageId: z.string(),
  files: z.array(z.string().meta({ format: 'binary' })).min(1).max(1000),
});
