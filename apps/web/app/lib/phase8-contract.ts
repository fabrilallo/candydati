import {
  CONSENT_SCOPES,
  CONSENT_STATUSES,
  IMPORT_CONFIDENCES,
  IMPORT_FIELDS,
  IMPORT_STATUSES,
  SUPPORTED_LOCALES,
  type ConsentStatus,
  type ImportConfidence,
  type ImportField,
  type ImportMapping,
  type ImportStatus,
} from '@tt/domain'
import { z } from 'zod'

/**
 * TEMPORARY mirror of the Phase 8 wire shapes (import and reconfirmation). Constants and entity types come from
 * `@tt/domain`; the DTOs are being written in the api at the same time, so they are read leniently here, in this one
 * file: the item as the domain `ImportItem` (nested `proposal`) or already flat, the batch with or without the job
 * title and the author's name. Unknown values fall back to a safe default; missing counts read as zero.
 */
const isoDate = z.iso.datetime({ offset: true })
const count = z.number().int().nonnegative().default(0)
const enc = (value: string): string => encodeURIComponent(value)
const isRecord = (raw: unknown): raw is Record<string, unknown> => typeof raw === 'object' && raw !== null && !Array.isArray(raw)

export const IMPORTS_PATH = '/api/v1/imports'
export const importPath = (batchId: string): string => `${IMPORTS_PATH}/${enc(batchId)}`
export const importMappingPath = (batchId: string): string => `${importPath(batchId)}/mapping`
export const importItemsPath = (batchId: string): string => `${importPath(batchId)}/items`
export const importCommitPath = (batchId: string): string => `${importPath(batchId)}/commit`
export const importUndoPath = (batchId: string): string => `${importPath(batchId)}/undo`
export const publicConsentPath = (token: string): string => `/api/v1/public/consent/${enc(token)}`

export type BatchStatus = ImportStatus
export type Confidence = ImportConfidence
export type MappingField = ImportField
export type { ConsentStatus, ImportMapping }

const oneOf = <T extends string>(values: readonly T[], fallback: T) => z.unknown().transform((raw): T => (typeof raw === 'string' && (values as readonly string[]).includes(raw) ? (raw as T) : fallback))

const countsSchema = z
  .object({
    files: count,
    cvs: count,
    rows: count,
    items: count,
    included: count,
    imported: count,
    merged: count,
    failed: count,
    noEmail: count,
    emailsQueued: count,
    skippedReconfirmed: count,
    erased: count,
    /** Files the analysis could not use (the web shows it when the api sends it). */
    ignored: count,
  })
  .loose()
export type BatchCounts = z.output<typeof countsSchema>

const mappingSchema = z
  .record(z.string(), z.string().nullable())
  .transform((raw): ImportMapping => Object.fromEntries(IMPORT_FIELDS.map((field) => [field, typeof raw[field] === 'string' ? raw[field] : null])) as ImportMapping)

/** `createdBy` as an id (with `createdByName`) or as `{ id, name }`; the job as `job` or `jobTitle`. */
const normaliseBatch = (raw: unknown): unknown => {
  if (!isRecord(raw)) return raw
  const author = isRecord(raw.createdBy)
    ? raw.createdBy
    : typeof raw.createdBy === 'string'
      ? { id: raw.createdBy, name: typeof raw.createdByName === 'string' ? raw.createdByName : null }
      : null
  const job = isRecord(raw.job) ? raw.job : typeof raw.jobTitle === 'string' && typeof raw.jobId === 'string' ? { id: raw.jobId, title: raw.jobTitle } : null
  return { ...raw, author, job }
}

export const importBatchSchema = z.preprocess(
  normaliseBatch,
  z.object({
    id: z.string(),
    status: oneOf<BatchStatus>(IMPORT_STATUSES, 'failed'),
    jobId: z.string().nullable().default(null),
    job: z.object({ id: z.string(), title: z.string() }).nullable().default(null),
    stageId: z.string().nullable().default(null),
    author: z.object({ id: z.string(), name: z.string().nullable().default(null) }).nullable().default(null),
    counts: countsSchema.default(() => countsSchema.parse({})),
    mapping: mappingSchema.nullable().default(null),
    /** Column headers of the sheet(s), for the mapping editor. */
    headers: z.array(z.string()).default([]),
    /** Up to three values per header (preview only; `{}` elsewhere). */
    columnSamples: z.record(z.string(), z.array(z.string()).max(3)).default({}),
    ignored: z.array(z.object({ name: z.string(), reason: z.string().default('other') })).default([]),
    /** Worker progress while analyzing or importing, when the api sends it. */
    progress: z.object({ done: count, total: count }).nullable().default(null),
    error: z.string().nullable().default(null),
    createdAt: isoDate,
    importedAt: isoDate.nullable().default(null),
    undoneAt: isoDate.nullable().default(null),
  }),
)
export type ImportBatchDto = z.output<typeof importBatchSchema>

export type ItemSource = { readonly kind: 'file'; readonly name: string } | { readonly kind: 'row'; readonly row: number }

const CONFLICT_FIELDS = ['email', 'phone', 'name', 'linkedinUrl'] as const
export type ConflictField = (typeof CONFLICT_FIELDS)[number]

/**
 * The item as the api sends it (the proposal spread on the item, or nested as the domain `proposal`; `candidate` and
 * `sources` nested) flattened to what the preview reads. An already flat item passes through.
 */
const flattenItem = (raw: unknown): unknown => {
  if (!isRecord(raw)) return raw
  const proposal = isRecord(raw.proposal) ? raw.proposal : raw
  if (!isRecord(proposal.candidate) && !isRecord(proposal.sources)) return raw
  const candidate = isRecord(proposal.candidate) ? proposal.candidate : {}
  const sources = isRecord(proposal.sources) ? proposal.sources : {}
  const existing = isRecord(proposal.existing) ? proposal.existing : null
  const files = Array.isArray(sources.files) ? sources.files : []
  const rows = Array.isArray(sources.rows) ? sources.rows : []
  return {
    ...raw,
    ...candidate,
    confidence: proposal.confidence,
    headline: proposal.headline ?? null,
    sources: [...files.map((name) => ({ kind: 'file', name })), ...rows.map((row) => ({ kind: 'row', row }))],
    existing: existing ? { id: existing.id, name: `${String(existing.firstName ?? '')} ${String(existing.lastName ?? '')}`.trim() } : null,
    conflicts: proposal.conflicts ?? [],
    flags: proposal.flags ?? [],
  }
}

export const importItemSchema = z.preprocess(
  flattenItem,
  z.object({
    id: z.string(),
    included: z.boolean().default(true),
    confidence: oneOf<Confidence>(IMPORT_CONFIDENCES, 'low'),
    firstName: z.string().default(''),
    lastName: z.string().default(''),
    email: z.string().nullable().default(null),
    phone: z.string().nullable().default(null),
    headline: z.string().nullable().default(null),
    sources: z
      .array(z.union([z.object({ kind: z.literal('file'), name: z.string() }), z.object({ kind: z.literal('row'), row: z.number().int().nonnegative() })]))
      .default([]),
    /** Same email as a candidate of the organization: the import adds an application, never overwrites. */
    existing: z.object({ id: z.string(), name: z.string() }).nullable().default(null),
    /** `existing`: the saved value stays (`kept`); `sources`: two files or rows disagreed and `kept` was used. */
    conflicts: z
      .array(z.object({ field: oneOf<ConflictField>(CONFLICT_FIELDS, 'name'), kind: oneOf(['existing', 'sources'] as const, 'existing'), kept: z.string(), other: z.string() }))
      .default([]),
    flags: z.array(z.string()).default([]),
  }),
)
export type ImportItemDto = z.output<typeof importItemSchema>

/** `GET /imports/:id`: `{ batch, items }`, or the batch itself with its `items`. */
export const importDetailSchema = z.preprocess(
  (raw) => (isRecord(raw) && !('batch' in raw) ? { batch: raw, items: raw.items } : raw),
  z.object({
    batch: importBatchSchema,
    items: z.array(importItemSchema).default([]),
    /** Items in the batch, when the api puts the page info in the data rather than in `meta`. */
    total: z.number().int().nonnegative().optional(),
  }),
)
export type ImportDetailDto = z.output<typeof importDetailSchema>

export const batchRefSchema = z.object({ id: z.string(), status: oneOf<BatchStatus>(IMPORT_STATUSES, 'failed') })

/** The undo answers with what it erased and how many reconfirmed candidates it kept (or the batch with those counts). */
export const undoResultSchema = z.preprocess(
  (raw) => (isRecord(raw) && isRecord(raw.counts) ? { removed: raw.counts.erased, kept: raw.counts.skippedReconfirmed } : raw),
  z.object({ removed: count, kept: count }),
)
export type UndoResultDto = z.output<typeof undoResultSchema>

/** Body of `PUT /imports/:id/items` (`importItemSelectionSchema` of the domain, one per changed item). */
export interface ItemsInput {
  readonly items: readonly { readonly itemId: string; readonly included: boolean }[]
}

// Candidates and applications: `consentStatus` and `importBatchId` ("HTTP", last line).
export const importedFields = {
  consentStatus: oneOf<ConsentStatus>(CONSENT_STATUSES, 'given').default('given'),
  importBatchId: z.string().nullable().default(null),
}

/** A card of the board: an imported application is erased at `retentionExpiresAt` unless the person reconfirms. */
export const cardConsentFields = { ...importedFields, retentionExpiresAt: isoDate.nullable().default(null) }

/** Consent of an application. Imported ones (`to_renew`) carry version 0 and no scopes until the person reconfirms. */
export const applicationConsentSchema = z.object({
  status: oneOf<ConsentStatus>(CONSENT_STATUSES, 'given').default('given'),
  privacyNoticeVersion: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .default(null)
    .transform((value) => (value === 0 ? null : value)),
  scopes: z.array(z.enum(CONSENT_SCOPES)).default([]),
  givenAt: isoDate.nullable().default(null),
})

// Public reconfirmation page. The notice has the shape of `publicPrivacyNoticeSchema` (redeclared: no import cycle).
const noticeSchema = z.object({
  version: z.number().int().positive(),
  language: z.enum(SUPPORTED_LOCALES),
  text: z.string(),
  contactEmail: z.string(),
  retentionDays: z.object({ selection: z.number().int().positive(), talent_pool: z.number().int().positive() }),
})

export const publicConsentSchema = z.preprocess(
  (raw) =>
    isRecord(raw)
      ? {
          ...raw,
          organization: isRecord(raw.organization) ? raw.organization : { name: raw.organizationName },
          job: isRecord(raw.job) ? raw.job : typeof raw.jobTitle === 'string' ? { title: raw.jobTitle } : null,
        }
      : raw,
  z.object({
    organization: z.object({ name: z.string() }),
    job: z.object({ title: z.string() }).nullable().default(null),
    notice: noticeSchema,
    expiresAt: isoDate.nullable().default(null),
  }),
)
export type PublicConsentDto = z.output<typeof publicConsentSchema>

export const consentAnswerSchema = z.unknown()
