import type { ImportBatchDto, ImportBatchPageDto, ImportItemDto } from '@tt/domain'

/** Where an item comes from: a file by its path or a data row (counted from 0). */
export type ItemSource = { readonly kind: 'file'; readonly name: string } | { readonly kind: 'row'; readonly row: number }

/** An item flattened for the preview step: the wire item (`ImportItemDto`) keeps its proposal nested. */
export interface ImportItemView {
  readonly id: string
  readonly included: boolean
  readonly confidence: ImportItemDto['confidence']
  readonly firstName: string
  readonly lastName: string
  readonly email: string | null
  readonly phone: string | null
  readonly headline: string | null
  readonly sources: readonly ItemSource[]
  /** Same email as a candidate of the organization: the import adds an application, never overwrites. */
  readonly existing: { readonly id: string; readonly name: string } | null
  readonly conflicts: ImportItemDto['conflicts']
  readonly flags: ImportItemDto['flags']
}

export interface ImportDetail {
  readonly batch: ImportBatchDto
  readonly items: readonly ImportItemView[]
}

/** Body of `PUT /imports/:id/items` (`importItemSelectionSchema` of the domain, one per changed item). */
export interface ItemsInput {
  readonly items: readonly { readonly itemId: string; readonly included: boolean }[]
}

export const toItemView = (item: ImportItemDto): ImportItemView => ({
  id: item.id,
  included: item.included,
  confidence: item.confidence,
  firstName: item.candidate.firstName,
  lastName: item.candidate.lastName,
  email: item.candidate.email,
  phone: item.candidate.phone,
  headline: item.headline,
  sources: [...item.sources.files.map((name): ItemSource => ({ kind: 'file', name })), ...item.sources.rows.map((row): ItemSource => ({ kind: 'row', row }))],
  existing: item.existing ? { id: item.existing.id, name: `${item.existing.firstName} ${item.existing.lastName}`.trim() } : null,
  conflicts: item.conflicts,
  flags: item.flags,
})

export const toImportDetail = (page: Pick<ImportBatchPageDto, 'batch' | 'items'>): ImportDetail => ({ batch: page.batch, items: page.items.map(toItemView) })
