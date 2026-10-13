/**
 * Client-side checks of the files picked for an import (contract "Flow" 1). A courtesy before uploading, never a
 * security boundary: the api checks types, sizes, rows and zip bombs again.
 */
export type ImportFileKind = 'cv' | 'archive' | 'table'

const KINDS: Readonly<Record<string, ImportFileKind>> = { pdf: 'cv', docx: 'cv', zip: 'archive', csv: 'table', xlsx: 'table' }

export const IMPORT_ACCEPT = ['.pdf', '.docx', '.zip', '.csv', '.xlsx'].join(',')

/** Pure: the kind of an accepted file from its extension, `null` for anything else. */
export const fileKind = (name: string): ImportFileKind | null => {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return null
  return KINDS[name.slice(dot + 1).toLowerCase()] ?? null
}

export interface PickedFile {
  readonly name: string
  readonly size: number
  /** Set by the browser for files picked inside a folder. */
  readonly webkitRelativePath?: string
}

export const pathOf = (file: PickedFile): string => (file.webkitRelativePath ? file.webkitRelativePath : file.name)

/** Pure: the files already picked plus the new ones, without picking the same path twice. */
export const mergeFiles = <T extends PickedFile>(current: readonly T[], added: readonly T[]): readonly T[] => {
  const seen = new Set(current.map(pathOf))
  const fresh = added.filter((file) => {
    const path = pathOf(file)
    if (seen.has(path)) return false
    seen.add(path)
    return true
  })
  return [...current, ...fresh]
}

export interface ImportLimits {
  readonly maxBytes: number
  readonly maxFiles: number
  readonly maxRows: number
}

export type SkipReason = 'unsupported' | 'empty'
export type LimitError = { readonly key: 'tooManyFiles'; readonly count: number; readonly max: number } | { readonly key: 'tooLarge'; readonly bytes: number; readonly max: number }

export interface FilesCheck<T> {
  readonly accepted: readonly T[]
  readonly skipped: readonly { readonly path: string; readonly reason: SkipReason }[]
  /** System files of a folder (`.DS_Store`, `Thumbs.db` and the like): left out without a word each. */
  readonly hidden: number
  readonly kinds: Readonly<Record<ImportFileKind, number>>
  readonly totalBytes: number
  readonly errors: readonly LimitError[]
  readonly ok: boolean
}

const isHidden = (file: PickedFile): boolean => pathOf(file).split('/').some((part) => part.startsWith('.') || part === '__MACOSX') || file.name === 'Thumbs.db'

const skipReason = (file: PickedFile): SkipReason | null => {
  if (fileKind(file.name) === null) return 'unsupported'
  if (file.size <= 0) return 'empty'
  return null
}

/** Pure: what will be uploaded, what is left out and why, and whether the batch fits the limits. */
export const checkImportFiles = <T extends PickedFile>(files: readonly T[], limits: ImportLimits): FilesCheck<T> => {
  const visible = files.filter((file) => !isHidden(file))
  const accepted = visible.filter((file) => skipReason(file) === null)
  const skipped = visible.flatMap((file) => {
    const reason = skipReason(file)
    return reason ? [{ path: pathOf(file), reason }] : []
  })
  const kinds = accepted.reduce<Record<ImportFileKind, number>>((acc, file) => {
    const kind = fileKind(file.name) as ImportFileKind
    return { ...acc, [kind]: acc[kind] + 1 }
  }, { cv: 0, archive: 0, table: 0 })
  const totalBytes = accepted.reduce((sum, file) => sum + file.size, 0)
  const errors: LimitError[] = [
    ...(accepted.length > limits.maxFiles ? [{ key: 'tooManyFiles' as const, count: accepted.length, max: limits.maxFiles }] : []),
    ...(totalBytes > limits.maxBytes ? [{ key: 'tooLarge' as const, bytes: totalBytes, max: limits.maxBytes }] : []),
  ]
  return { accepted, skipped, hidden: files.length - visible.length, kinds, totalBytes, errors, ok: accepted.length > 0 && errors.length === 0 }
}
