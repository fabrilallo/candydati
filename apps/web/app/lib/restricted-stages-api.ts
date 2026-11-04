import { restrictedStagesSchema, type RestrictedStagesDto, type StageRef } from '@candydati/domain'
import { callApi } from './api-call'
import { restrictedStagesPath, stageRestrictionPath } from './api-paths'
import type { JobApiRequest } from './job-api'

/**
 * Restricted stages of a job (PRODUCT.md §6.2): notes and feedback written at one of them are read only by owners,
 * admins, the job's hiring manager and the author. The api filters; the web only shows and toggles.
 */
export type { RestrictedStagesDto }

export interface RestrictableStage {
  readonly id: string
  readonly name: string
  readonly restricted: boolean
}

export const getRestrictedStages = async (request: JobApiRequest, jobId: string): Promise<RestrictedStagesDto> =>
  (await callApi(request, restrictedStagesPath(jobId), restrictedStagesSchema)).data

export const setStageRestriction = async (request: JobApiRequest, jobId: string, stageId: string, restricted: boolean): Promise<RestrictedStagesDto> =>
  (await callApi(request, stageRestrictionPath(jobId, stageId), restrictedStagesSchema, { method: 'PUT', body: { restricted } })).data

/** Pure: whether `stageId` is one of the restricted stages (no stage, or no list, is never restricted). */
export const atRestrictedStage = (stageId: string | null, restrictedIds: readonly string[] | undefined): boolean =>
  stageId !== null && (restrictedIds ?? []).includes(stageId)

/** Pure: the declared stages of a job (not "received"), each with its name and whether it is restricted. */
export const restrictableStages = (stages: readonly StageRef[], restrictedIds: readonly string[], nameOf: (stage: StageRef) => string): readonly RestrictableStage[] =>
  stages.filter((stage) => stage.declared !== null).map((stage) => ({ id: stage.id, name: nameOf(stage), restricted: restrictedIds.includes(stage.id) }))
