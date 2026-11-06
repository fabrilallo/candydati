import { pipelineStagesOf, type CopyAutomationsInput, type JobContent } from '@candydati/domain'
import { stageName } from './pipeline-board'

/** What is copied: one rule, or every rule of a stage, of the job being edited. */
export type CopySource = { readonly kind: 'rule'; readonly ruleId: string; readonly stageId: string } | { readonly kind: 'stage'; readonly stageId: string }

/** Where to: another stage of this job, a stage of another job, or an automation pack on a kind of stage. */
export type CopyTargetKind = 'this_job' | 'other_job' | 'pack'

export interface CopyTarget {
  readonly kind: CopyTargetKind
  /** The other job or the pack; ignored for `this_job`. */
  readonly holderId: string
  readonly stageId: string
}

export interface StageOption {
  readonly id: string
  readonly label: string
}

/** Pure: the stages of a job content, named like the board names them. `exclude`: a stage not to offer. */
export const stageOptions = (content: Pick<JobContent, 'process'>, t: (key: string) => string, exclude: string | null = null): readonly StageOption[] =>
  pipelineStagesOf(content.process)
    .filter((stage) => stage.id !== exclude)
    .map((stage) => ({ id: stage.id, label: stageName(stage, t) }))

/** Pure: the body of `POST /automations/copy`, or null while the target is not chosen yet. */
export function copyInput(jobId: string, source: CopySource, target: CopyTarget): CopyAutomationsInput | null {
  if (target.stageId === '' || (target.kind !== 'this_job' && target.holderId === '')) return null
  const from = source.kind === 'rule' ? { jobId, ruleIds: [source.ruleId] } : { jobId, stageId: source.stageId }
  const to =
    target.kind === 'pack'
      ? { packId: target.holderId, stageId: target.stageId }
      : { jobId: target.kind === 'this_job' ? jobId : target.holderId, stageId: target.stageId }
  return { from, to }
}
