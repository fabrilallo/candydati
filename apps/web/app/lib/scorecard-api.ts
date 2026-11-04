import { jobScorecardSchema, suggestScorecardResultSchema, type JobScorecardDto } from '@candydati/domain'
import { callApi, defaultFailureKey, type FailureKey } from './api-call'
import { jobScorecardPath, suggestScorecardPath } from './api-paths'
import type { JobApiRequest } from './job-api'
import type { ScorecardBody } from './scorecard-form'

/** The evaluation criteria of a job over HTTP (PRODUCT.md §2.4): words to look for, never a score. */
export interface ScorecardSuggestion {
  readonly status: 'proposed' | 'unavailable' | 'failed'
  readonly criteria: readonly string[]
}

export const getScorecard = async (request: JobApiRequest, jobId: string): Promise<JobScorecardDto> => (await callApi(request, jobScorecardPath(jobId), jobScorecardSchema)).data

const SAVE_ISSUES = ['criterion_in_use', 'duplicate_criterion', 'unknown_stage', 'unknown_criterion'] as const

/** Pure: what to say when the api refuses the list (a locked criterion changed, a stage removed meanwhile, a repeat). */
export const scorecardFailureKey: FailureKey = (failure) => {
  const issue = SAVE_ISSUES.find((message) => failure.issues.some((item) => item.message === message))
  return issue ? `job.scorecard.errors.${issue}` : defaultFailureKey(failure)
}

export const putScorecard = async (request: JobApiRequest, jobId: string, body: ScorecardBody): Promise<JobScorecardDto> =>
  (await callApi(request, jobScorecardPath(jobId), jobScorecardSchema, { method: 'PUT', body }, scorecardFailureKey)).data

/** Labels drafted from the ad; nothing is saved. `criteria` is empty unless proposed. */
export const suggestScorecard = async (request: JobApiRequest, jobId: string): Promise<ScorecardSuggestion> => {
  const { data } = await callApi(request, suggestScorecardPath(jobId), suggestScorecardResultSchema, { method: 'POST' })
  return { status: data.status, criteria: data.status === 'proposed' ? (data.criteria ?? []) : [] }
}
