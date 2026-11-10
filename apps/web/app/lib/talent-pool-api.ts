import type { CandidateCriteria } from '@candydati/domain'
import { z } from 'zod'
import { callApi, defaultFailureKey, type FailureKey } from './api-call'
import type { JobApiRequest } from './job-api'

/** One candidate of the talent pool whose CV meets every criterion: in clear for the recruiter, never sent to a model. */
export const talentPersonSchema = z.object({
  candidateId: z.string(),
  fullName: z.string(),
  appliedToThisJob: z.boolean(),
  lastAppliedAt: z.string().nullable(),
  skillMatches: z.array(z.object({ criterion: z.string(), matchedAs: z.string() })),
})
export type TalentPerson = z.output<typeof talentPersonSchema>
const talentPageSchema = z.object({ criteria: z.array(z.string()), total: z.number(), notEvaluable: z.number(), page: z.number(), limit: z.number(), people: z.array(talentPersonSchema) })
export type TalentPage = z.output<typeof talentPageSchema>

/** Criteria refused (empty, or a protected characteristic) read as such, not as a generic error. */
const talentFailureKey: FailureKey = (failure) => (failure.code === 'validation_failed' ? 'talentSearch.errors.invalid' : defaultFailureKey(failure))

const searchOf = (jobId: string): string => `/api/v1/jobs/${encodeURIComponent(jobId)}/talent-pool/search`

/** Candidates whose consent covers future positions and whose CV meets every criterion; most recent application first, never a ranking. */
export const searchTalentPool = async (request: JobApiRequest, { jobId, criteria, page }: { jobId: string; criteria: CandidateCriteria; page: number }): Promise<TalentPage> =>
  (await callApi(request, searchOf(jobId), talentPageSchema, { method: 'POST', body: { criteria, page } }, talentFailureKey)).data
