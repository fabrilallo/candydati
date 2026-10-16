import { IMPORT_FIELDS, type ImportField, type ImportMapping } from '@candydati/domain'

/**
 * The "Colonne" step in pure functions. The domain mapping points each field to one header (`ImportMapping`); the
 * screen shows it the other way round, one row per column with the field it holds. A field moves to the column the
 * user picks, so two columns never hold the same field.
 */
const NAME_FIELDS: readonly ImportField[] = ['firstName', 'lastName', 'fullName', 'file']
const SAMPLES_SHOWN = 3

export type MappingWarning = 'noName' | 'noEmail'

export interface MappingColumnView {
  readonly header: string
  readonly field: ImportField | null
  readonly samples: readonly string[]
}

export interface MappingView {
  readonly columns: readonly MappingColumnView[]
  readonly warnings: readonly MappingWarning[]
}

export const emptyMapping = (): ImportMapping => Object.fromEntries(IMPORT_FIELDS.map((field) => [field, null])) as unknown as ImportMapping

/** Pure: the field a header holds in the mapping, `null` when ignored. */
export const fieldOf = (mapping: ImportMapping, header: string): ImportField | null => IMPORT_FIELDS.find((field) => mapping[field] === header) ?? null

/** Pure: one row per column, with up to three non-empty samples, and what would make the matching weak. */
export const mappingView = (headers: readonly string[], mapping: ImportMapping, samples: Readonly<Record<string, readonly string[]>>): MappingView => {
  const columns = headers.map((header) => ({
    header,
    field: fieldOf(mapping, header),
    samples: (samples[header] ?? []).map((sample) => sample.trim()).filter((sample) => sample !== '').slice(0, SAMPLES_SHOWN),
  }))
  const mapped = (field: ImportField): boolean => mapping[field] !== null && headers.includes(mapping[field] as string)
  const warnings: MappingWarning[] = [...(NAME_FIELDS.some(mapped) ? [] : ['noName' as const]), ...(mapped('email') ? [] : ['noEmail' as const])]
  return { columns, warnings }
}

/** Pure: `header` now holds `field` (or nothing); the field leaves any other column it was on. */
export const setHeaderField = (mapping: ImportMapping, header: string, field: ImportField | null): ImportMapping => {
  const cleared = Object.fromEntries(IMPORT_FIELDS.map((key) => [key, mapping[key] === header ? null : mapping[key]])) as unknown as ImportMapping
  return field === null ? cleared : { ...cleared, [field]: header }
}

export const mappingChanged = (original: ImportMapping, current: ImportMapping): boolean => IMPORT_FIELDS.some((field) => original[field] !== current[field])
