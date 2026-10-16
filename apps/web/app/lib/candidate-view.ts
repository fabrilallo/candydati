import { TAG_MAX, TAGS_PER_CANDIDATE_MAX, type CandidateApplicationDto, type StageRef } from '@candydati/domain'

export const fullName = (person: { readonly firstName: string; readonly lastName: string }): string => `${person.firstName.trim()} ${person.lastName.trim()}`.trim()

/** Pure: tags are lowercase, single-spaced, at most `TAG_MAX` characters; null when nothing usable is left. */
export const normalizeTag = (input: string): string | null => {
  const tag = input.trim().replace(/\s+/g, ' ').toLowerCase()
  return tag === '' || tag.length > TAG_MAX ? null : tag
}

/** Pure: a new list with the tag, or the same list when it is a duplicate, empty, or over the limit. */
export const addTag = (tags: readonly string[], input: string): readonly string[] => {
  const tag = normalizeTag(input)
  if (tag === null || tags.includes(tag) || tags.length >= TAGS_PER_CANDIDATE_MAX) return tags
  return [...tags, tag]
}

export const removeTag = (tags: readonly string[], tag: string): readonly string[] => tags.filter((item) => item !== tag)

const byNewest = (a: CandidateApplicationDto, b: CandidateApplicationDto): number => b.createdAt.localeCompare(a.createdAt)

/** The application the header talks about: the newest open one, else the newest of all. */
export const currentApplication = (applications: readonly CandidateApplicationDto[]): CandidateApplicationDto | null => {
  const sorted = applications.toSorted(byNewest)
  return sorted.find((app) => app.outcome === null) ?? sorted[0] ?? null
}

export const stageOf = (app: Pick<CandidateApplicationDto, 'stageId' | 'stages'>): StageRef | null => app.stages.find((stage) => stage.id === app.stageId) ?? null

export type StatusTone = 'secondary' | 'success' | 'outline'

/** "In corso" while open; the outcome once decided. Colour only codes the state. */
export const applicationStatus = (app: Pick<CandidateApplicationDto, 'outcome'>): { readonly key: string; readonly tone: StatusTone } => {
  if (app.outcome === null) return { key: 'candidate.status.open', tone: 'secondary' }
  return { key: `candidate.outcomes.${app.outcome}`, tone: app.outcome === 'hired' ? 'success' : 'outline' }
}

const SOON_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

export type RetentionState = 'ok' | 'soon' | 'expired'

/** Whether the retention expiry is far, within 30 days, or already past (the daily job will act on it). */
export const retentionState = (iso: string, now: Date): RetentionState => {
  const at = new Date(iso).getTime()
  if (Number.isNaN(at)) return 'ok'
  if (at <= now.getTime()) return 'expired'
  return at - now.getTime() <= SOON_DAYS * DAY_MS ? 'soon' : 'ok'
}
