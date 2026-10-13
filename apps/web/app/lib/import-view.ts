import type { BatchCounts, BatchStatus, ConsentStatus, ItemSource } from './phase8-contract'

export type BatchTone = 'secondary' | 'default' | 'success' | 'destructive' | 'outline'

const TONES: Readonly<Record<BatchStatus, BatchTone>> = {
  uploaded: 'secondary',
  analyzing: 'secondary',
  ready: 'default',
  importing: 'secondary',
  done: 'success',
  failed: 'destructive',
  undone: 'outline',
}

/** Pill of a batch: done = success, failed = destructive, undone = spent, ready = selection (it waits for you). */
export const batchTone = (status: BatchStatus): BatchTone => TONES[status]

export type WizardStep = 'files' | 'analysis' | 'mapping' | 'preview' | 'confirm' | 'result'
export const WIZARD_STEPS: readonly WizardStep[] = ['files', 'analysis', 'mapping', 'preview', 'confirm', 'result']

/** Pure: where an existing batch reopens. A failed batch shows its error in the analysis step. */
export const wizardStep = (status: BatchStatus): WizardStep => {
  if (status === 'ready') return 'mapping'
  if (status === 'importing' || status === 'done' || status === 'undone') return 'result'
  return 'analysis'
}

/** The worker is on it: the batch is polled, nothing is editable. */
export const isWorking = (status: BatchStatus): boolean => status === 'uploaded' || status === 'analyzing' || status === 'importing'

export const progressPercent = (progress: { readonly done: number; readonly total: number } | null): number | null =>
  progress === null || progress.total <= 0 ? null : Math.min(100, Math.round((progress.done / progress.total) * 100))

const IGNORED: Readonly<Record<string, string>> = {
  unsupported_type: 'unsupported',
  unsupported: 'unsupported',
  unreadable: 'unreadable',
  empty: 'empty',
  too_large: 'tooLarge',
  duplicate: 'duplicate',
  zip_bomb: 'archive',
  encrypted: 'encrypted',
}

export const ignoredReasonKey = (reason: string): string => `imports.ignored.${IGNORED[reason] ?? 'other'}`

type Tr = (key: string, params?: Record<string, unknown>) => string

/**
 * Where an item comes from: a file by its path, a row by the number the user sees in the sheet. The api counts data
 * rows from 0; the sheet shows the header on row 1, so data row 0 is row 2.
 */
export const sourceText = (source: ItemSource, t: Tr): string => (source.kind === 'file' ? source.name : t('imports.preview.row', { row: source.row + 2 }))

/** Pure: the three figures of a batch, from the domain counts (imported includes the merged ones). */
export const batchFigures = (counts: BatchCounts): { readonly created: number; readonly merged: number; readonly excluded: number } => ({
  created: Math.max(0, counts.imported - counts.merged),
  merged: counts.merged,
  excluded: Math.max(0, counts.items - counts.included),
})

export type RenewalTone = 'warning' | 'destructive'
export interface ConsentRenewal {
  /** Whole days before the erasure; `null` when the date is unknown. */
  readonly days: number | null
  readonly tone: RenewalTone
}

const DAY_MS = 86_400_000

/** Pure: the "Consenso da rinnovare" pill (state colour: warning, destructive on the last day), `null` once given. */
export const consentRenewal = (status: ConsentStatus, expiresAt: string | null, now: Date): ConsentRenewal | null => {
  if (status !== 'to_renew') return null
  const at = expiresAt ? Date.parse(expiresAt) : Number.NaN
  if (Number.isNaN(at)) return { days: null, tone: 'warning' }
  const days = Math.max(0, Math.ceil((at - now.getTime()) / DAY_MS))
  return { days, tone: days <= 1 ? 'destructive' : 'warning' }
}

interface RenewableApplication {
  readonly consentStatus: ConsentStatus
  readonly consent: { readonly status: ConsentStatus }
  readonly retentionExpiresAt: string
}

/** The consent of this application is to renew, whichever of the two fields the api sets. */
export const isToRenew = (app: Pick<RenewableApplication, 'consentStatus' | 'consent'>): boolean => app.consentStatus === 'to_renew' || app.consent.status === 'to_renew'

/** Pure: the earliest erasure date among the applications whose consent is to renew, `null` when there is none. */
export const renewalDeadline = (applications: readonly RenewableApplication[]): string | null =>
  applications
    .filter(isToRenew)
    .map((app) => app.retentionExpiresAt)
    .toSorted()[0] ?? null
