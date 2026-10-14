import { familyOfRole, WORK_MODES, type JobRoleFamily, type PublicJobSummaryDto } from '@tt/domain'

type WorkMode = PublicJobSummaryDto['workMode']

export interface CareersGroup {
  readonly family: JobRoleFamily
  readonly jobs: readonly PublicJobSummaryDto[]
}

const newestFirst = (a: PublicJobSummaryDto, b: PublicJobSummaryDto): number => b.publishedAt.localeCompare(a.publishedAt)

/** Role families, the one with most open positions first (ties keep first appearance), newest ad first inside. */
export const groupCareers = (jobs: readonly PublicJobSummaryDto[]): readonly CareersGroup[] => {
  const byFamily = jobs.reduce<ReadonlyMap<JobRoleFamily, readonly PublicJobSummaryDto[]>>((acc, job) => {
    const family = familyOfRole(job.role)
    return new Map([...acc, [family, [...(acc.get(family) ?? []), job]]])
  }, new Map())
  return [...byFamily.entries()]
    .map(([family, items]) => ({ family, jobs: [...items].sort(newestFirst) }))
    .sort((a, b) => b.jobs.length - a.jobs.length)
}

export interface CareersFilter {
  readonly workMode: WorkMode | null
  readonly family: JobRoleFamily | null
}

export const filterCareers = (jobs: readonly PublicJobSummaryDto[], { workMode, family }: CareersFilter): readonly PublicJobSummaryDto[] =>
  jobs.filter((job) => (workMode === null || job.workMode === workMode) && (family === null || familyOfRole(job.role) === family))

/** Work modes that have at least one open position, in taxonomy order. */
export const workModesOf = (jobs: readonly PublicJobSummaryDto[]): readonly { readonly workMode: WorkMode; readonly count: number }[] =>
  WORK_MODES.map((workMode) => ({ workMode, count: jobs.filter((job) => job.workMode === workMode).length })).filter(({ count }) => count > 0)

export interface CareersStats {
  readonly openCount: number
}

export const careersStats = (jobs: readonly PublicJobSummaryDto[]): CareersStats => ({
  openCount: jobs.length,
})
