import { MAX_STAGES, duplicateStageResultSchema, type JobDto, type StageConfigKind } from '@candydati/domain'
import { callApi } from './api-call'
import { stageDuplicatePath } from './api-paths'
import type { JobApiRequest } from './job-api'
import { insertItem, type StageForm } from './job-form'

export interface StageDuplicateResult {
  readonly job: JobDto
  /** Id of the new stage, right after the source. */
  readonly stageId: string
  readonly copied: readonly StageConfigKind[]
  /** Configuration the source has that the person may not manage: not copied. */
  readonly skipped: readonly StageConfigKind[]
}

/** The api copies a saved stage with what is tied to it (interviewers, criteria, automations, restriction). */
export const requestStageDuplicate = async (request: JobApiRequest, jobId: string, stageId: string): Promise<StageDuplicateResult> => {
  const { data } = await callApi(request, stageDuplicatePath(jobId, stageId), duplicateStageResultSchema, { method: 'POST', body: {} })
  return { ...data, job: data.job as JobDto }
}

/** Pure: a stage never saved is copied in the form only (its fields; the server gives it an id on save). */
export const duplicateStageLocally = (process: readonly StageForm[], index: number): readonly StageForm[] => {
  const source = process[index]
  return source ? insertItem(process, index + 1, { ...source, id: '' }) : process
}

/** Why a stage cannot be duplicated now: the process is full, or (for a saved stage) the form has unsaved changes. */
export type DuplicateBlock = 'max' | 'saveFirst'

/** Pure. `dirty` matters only for saved stages: the caller passes false for a stage that lives in the form only. */
export const duplicateBlockOf = ({ count, dirty }: { readonly count: number; readonly dirty: boolean }): DuplicateBlock | null =>
  count >= MAX_STAGES ? 'max' : dirty ? 'saveFirst' : null

type Translate = (key: string, values?: Record<string, unknown>) => string

/** Pure: the toast after a duplicate, saying what came along and what was left out for permissions. */
export const duplicationNotice = (result: Pick<StageDuplicateResult, 'copied' | 'skipped'>, t: Translate): { readonly title: string; readonly description: string | undefined } => {
  const list = (kinds: readonly StageConfigKind[]) => kinds.map((kind) => t(`job.editor.process.duplicateKinds.${kind}`)).join(', ')
  const parts = [
    result.copied.length > 0 ? t('job.editor.process.duplicatedCopied', { list: list(result.copied) }) : null,
    result.skipped.length > 0 ? t('job.editor.process.duplicatedSkipped', { list: list(result.skipped) }) : null,
  ].filter((part): part is string => part !== null)
  return { title: t('job.editor.process.duplicated'), description: parts.length > 0 ? parts.join(' ') : undefined }
}
