import { dataExportStatusSchema } from '@tt/domain'
import { z } from 'zod'

/**
 * TEMPORARY mirror of the Phase 5 wire DTOs (phase 5 contract, "HTTP"). Permissions, constants, statuses and the
 * correction input come from `@tt/domain`; the response shapes are not exported anywhere yet, so they live here, in
 * this one file, until the api mappers land and the domain (or a shared DTO module) exports them. Where the contract
 * leaves a field open, the schema accepts the plausible spellings and normalises them.
 */
const isoDate = z.iso.datetime({ offset: true })

export const erasedSchema = z.object({ erased: z.literal(true) })

const personName = z.object({ firstName: z.string(), lastName: z.string() })

/** The candidate of an upcoming expiry: `candidate`, `candidateName` or first and last name at the top level. */
const upcomingObject = z.object({
  applicationId: z.string(),
  candidateId: z.string(),
  jobId: z.string().nullable().default(null),
  jobTitle: z.string(),
  retentionExpiresAt: isoDate,
  candidateName: z.string().nullable().default(null),
})
const flattenCandidate = (raw: unknown): unknown => {
  if (typeof raw !== 'object' || raw === null) return raw
  const record = raw as Record<string, unknown>
  if (typeof record.candidateName === 'string') return raw
  const source = personName.safeParse(record.candidate).data ?? personName.safeParse(record).data
  const candidateId = record.candidateId ?? (record.candidate as { id?: unknown } | undefined)?.id
  return { ...record, candidateId, candidateName: source ? `${source.firstName.trim()} ${source.lastName.trim()}`.trim() : null }
}
export const retentionUpcomingSchema = z.preprocess(flattenCandidate, upcomingObject)
export type RetentionUpcomingDto = z.output<typeof upcomingObject>

export const retentionRunSchema = z.object({
  id: z.string(),
  startedAt: isoDate,
  finishedAt: isoDate.nullable().default(null),
  warned: z.number().int().nonnegative(),
  erased: z.number().int().nonnegative(),
})
export type RetentionRunDto = z.infer<typeof retentionRunSchema>

export const retentionOverviewSchema = z.object({ upcoming: z.array(retentionUpcomingSchema), lastRuns: z.array(retentionRunSchema) })
export type RetentionOverviewDto = z.output<typeof retentionOverviewSchema>

/** "Scaduto" is not a status: a ready export past `expiresAt` reads as expired (`exportState`). */
export const dataExportSchema = z.object({
  id: z.string(),
  status: dataExportStatusSchema,
  sizeBytes: z.number().int().nonnegative().nullable().default(null),
  createdAt: isoDate,
  completedAt: isoDate.nullable().default(null),
  expiresAt: isoDate.nullable().default(null),
})
export type DataExportDto = z.infer<typeof dataExportSchema>
export const dataExportCreatedSchema = z.object({ id: z.string(), status: dataExportStatusSchema })

/** A configured provider of the registro: as a list of `{ category, name }` or as a record category -> name. */
const providerSchema = z.object({ category: z.string(), name: z.string(), detail: z.string().nullable().default(null) })
const providersSchema = z.union([
  z.array(z.preprocess((raw) => (typeof raw === 'object' && raw !== null && !('category' in raw) ? { ...raw, category: (raw as { kind?: unknown; role?: unknown }).kind ?? (raw as { role?: unknown }).role } : raw), providerSchema)),
  z.record(z.string(), z.string().nullable()).transform((record) =>
    Object.entries(record)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '')
      .map(([category, name]) => ({ category, name, detail: null })),
  ),
])

const retentionDaysSchema = z.object({ selection: z.number().int().positive(), talent_pool: z.number().int().positive() })

export const processingRecordSchema = z.object({
  organization: z.object({ name: z.string(), contactEmail: z.string().nullable().default(null) }),
  privacyNoticeVersion: z.number().int().positive().nullable().default(null),
  retentionDays: retentionDaysSchema.nullable().default(null),
  providers: providersSchema.default([]),
  generatedAt: isoDate.nullable().default(null),
})
export type ProcessingRecordDto = z.output<typeof processingRecordSchema>
export type ProviderDto = ProcessingRecordDto['providers'][number]
