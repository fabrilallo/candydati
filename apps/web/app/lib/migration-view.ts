import { MIGRATION_FETCH_ERRORS, MIGRATION_ISSUE_LEVELS, MIGRATION_STAGE_TARGETS, normaliseStageName, type MigrationBatchDto, type MigrationJobCountDto, type MigrationStageTarget } from '@candydati/domain'
import { ApiFailure } from './api-call'

type Status = MigrationBatchDto['status']
type MappingEntry = MigrationBatchDto['stageMapping'][number]

export type MigrationTone = 'secondary' | 'default' | 'success' | 'destructive' | 'outline'

const TONES: Readonly<Record<Status, MigrationTone>> = {
  uploaded: 'secondary',
  fetching: 'secondary',
  analyzing: 'secondary',
  ready: 'default',
  importing: 'secondary',
  done: 'success',
  failed: 'destructive',
  undone: 'outline',
}

/** Pill of a migration: done = success, failed = destructive, undone = spent, ready = selection (it waits for you). */
export const migrationTone = (status: Status): MigrationTone => TONES[status]

/** The worker is on it: the migration is polled, nothing is editable. */
export const isWorking = (status: Status): boolean => status === 'uploaded' || status === 'fetching' || status === 'analyzing' || status === 'importing'

export type MigrationStep = 'source' | 'upload' | 'analysis' | 'preview' | 'stages' | 'confirm' | 'result'
export const MIGRATION_STEPS: readonly MigrationStep[] = ['source', 'upload', 'analysis', 'preview', 'stages', 'confirm', 'result']

/** Pure: where an existing migration reopens. A failed one shows its reason in the analysis step, unless the commit had started. */
export const stepOf = (batch: Pick<MigrationBatchDto, 'status' | 'counts'>): MigrationStep => {
  if (batch.status === 'ready') return 'preview'
  if (batch.status === 'importing' || batch.status === 'done' || batch.status === 'undone') return 'result'
  if (batch.status === 'failed' && batch.counts.commit !== undefined) return 'result'
  return 'analysis'
}

const excludedSet = (batch: Pick<MigrationBatchDto, 'excludedJobs'>): ReadonlySet<string> => new Set(batch.excludedJobs)

/** Stages of jobs that stay in, still waiting for a type: the commit refuses while there are any. */
export const unmappedCount = (batch: Pick<MigrationBatchDto, 'stageMapping' | 'excludedJobs'>): number => {
  const excluded = excludedSet(batch)
  return batch.stageMapping.filter((entry) => entry.type === 'other' && !excluded.has(entry.jobRef)).length
}

export interface JobView {
  readonly count: MigrationJobCountDto
  readonly excluded: boolean
  readonly stages: readonly MappingEntry[]
  readonly unmapped: number
}

/** The jobs of the package with their stage mapping and whether the operator left them out. */
export const jobViews = (batch: Pick<MigrationBatchDto, 'counts' | 'stageMapping' | 'excludedJobs'>): readonly JobView[] => {
  const excluded = excludedSet(batch)
  return (batch.counts.perJob ?? []).map((count) => {
    const stages = batch.stageMapping.filter((entry) => entry.jobRef === count.jobRef)
    return { count, excluded: excluded.has(count.jobRef), stages, unmapped: stages.filter((entry) => entry.type === 'other').length }
  })
}

export interface StageNameGroup {
  /** Normalised name: what the bulk choice matches. */
  readonly key: string
  /** The name as the first job writes it. */
  readonly name: string
  readonly jobs: number
  /** The type every stage with this name has now, or null when they differ. */
  readonly type: MigrationStageTarget | null
}

/** Stage names across jobs (compared like the server does), so one choice can map them all. */
export const stageNameGroups = (mapping: readonly MappingEntry[]): readonly StageNameGroup[] => {
  const groups = new Map<string, { name: string; jobs: Set<string>; types: Set<MigrationStageTarget> }>()
  for (const entry of mapping) {
    const key = normaliseStageName(entry.sourceName)
    const group = groups.get(key) ?? { name: entry.sourceName, jobs: new Set<string>(), types: new Set<MigrationStageTarget>() }
    group.jobs.add(entry.jobRef)
    group.types.add(entry.type)
    groups.set(key, group)
  }
  return [...groups].map(([key, group]) => ({ key, name: group.name, jobs: group.jobs.size, type: group.types.size === 1 ? ([...group.types][0] ?? null) : null }))
}

export const STAGE_TARGETS = MIGRATION_STAGE_TARGETS

/** Translation key of a stage target: the product's own names for types, "Received" for the first column. */
export const stageTargetKey = (target: MigrationStageTarget): string =>
  target === 'received' ? 'pipeline.received' : target === 'other' ? 'migrations.stages.other' : `taxonomy.stageTypes.${target}`

export interface PreviewFigures {
  readonly jobs: number
  readonly jobsLeftOut: number
  readonly applications: number
  readonly candidates: number
  readonly notes: number
  readonly messages: number
  readonly files: number
}

/** Pure: what the preview headlines. Jobs and applications follow the jobs the operator leaves out; the rest are package totals. */
export const previewFigures = (batch: Pick<MigrationBatchDto, 'counts' | 'excludedJobs'>): PreviewFigures => {
  const { counts } = batch
  const excluded = excludedSet(batch)
  const kept = (counts.perJob ?? []).filter((job) => !excluded.has(job.jobRef))
  return {
    jobs: kept.length,
    jobsLeftOut: (counts.perJob ?? []).length - kept.length,
    applications: kept.reduce((sum, job) => sum + job.applications, 0),
    candidates: counts.candidates ?? 0,
    notes: counts.notes ?? 0,
    messages: counts.messages ?? 0,
    files: counts.files ?? 0,
  }
}

export const ISSUE_LEVELS = MIGRATION_ISSUE_LEVELS

/** Issue totals by level, as the analysis counted them. */
export const issueTotals = (counts: MigrationBatchDto['counts']): Readonly<Record<(typeof ISSUE_LEVELS)[number], number>> => ({
  error: counts.issueErrors ?? 0,
  warning: counts.issueWarnings ?? 0,
  info: counts.issueInfos ?? 0,
})

/** Pure: the refusal of a commit in words: still-unmapped stages with their count, or the code of a finding the choices cannot fix. */
export const commitErrorKey = (error: unknown): { readonly key: string; readonly count?: number } | null => {
  if (!(error instanceof ApiFailure)) return null
  for (const issue of error.failure.issues) {
    const unmapped = /^stages_unmapped:(\d+)$/.exec(issue.message)
    if (unmapped) return { key: 'migrations.errors.stagesUnmapped', count: Number(unmapped[1]) }
    if (issue.message.startsWith('too_many_stages')) return { key: 'migrations.errors.tooManyStages' }
    if (issue.message === 'privacy_notice_missing') return { key: 'migrations.errors.privacyNoticeMissing' }
  }
  return null
}

const FAILURE_CODES: ReadonlySet<string> = new Set([
  'invalid_archive', 'unsafe_path', 'symlink', 'too_many_entries', 'too_large', 'ratio_exceeded', 'duplicate_entry', 'unexpected_entry',
  'missing_manifest', 'invalid_manifest', 'missing_files', 'privacy_notice_missing', 'organization_missing', 'job_content_invalid',
  'analysis_failed', 'commit_failed', 'queue_unavailable', ...MIGRATION_FETCH_ERRORS,
])

/** Translation key of the reason a migration failed: its own words when the code is known, a generic one otherwise. */
export const failureKey = (code: string | null): string => `migrations.failure.${code !== null && FAILURE_CODES.has(code) ? code : 'unknown'}`
