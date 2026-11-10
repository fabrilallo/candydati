import { CRITERIA_YEARS_MAX, type CandidateCriteria } from '@candydati/domain'

/** The search form as typed: one text per criterion, words separated by commas. */
export interface TalentCriteriaForm {
  readonly skills: string
  readonly languages: string
  readonly minYears: string
  readonly location: string
  readonly keywords: string
}

/** Every skill must be in the CV: three technologies of the ad are a starting point, not a wall. */
const PREFILLED_SKILLS = 3
/** The caps of `candidateCriteriaSchema` (skills 15, languages 5, locations 10, keywords 10; 60 characters a term). */
const CAPS = { skills: 15, languages: 5, locations: 10, keywords: 10 } as const
const TERM_MAX = 60

/** Pure: the words of a criterion, one per comma, trimmed, without repeats, capped. */
const terms = (text: string, max: number): string[] =>
  text
    .split(',')
    .map((word) => word.trim().slice(0, TERM_MAX).trim())
    .filter((word, index, all) => word !== '' && all.indexOf(word) === index)
    .slice(0, max)

/** Pure: the search prefilled from the job: its first technologies and its city. */
export const talentCriteriaFromJob = (job: { readonly technologies: readonly string[]; readonly city: string | null }): TalentCriteriaForm => ({
  skills: job.technologies.slice(0, PREFILLED_SKILLS).join(', '),
  languages: '',
  minYears: '',
  location: job.city?.trim() ?? '',
  keywords: '',
})

/** Pure: the criteria as the api takes them; a minimum of years only when it is a whole number in range. */
export const talentQuery = (form: TalentCriteriaForm): CandidateCriteria => {
  const years = Number(form.minYears.trim())
  const validYears = form.minYears.trim() !== '' && Number.isInteger(years) && years >= 0 && years <= CRITERIA_YEARS_MAX
  return {
    skills: terms(form.skills, CAPS.skills),
    languages: terms(form.languages, CAPS.languages),
    locations: terms(form.location, CAPS.locations),
    keywords: terms(form.keywords, CAPS.keywords),
    ...(validYears ? { minYearsOfExperience: years } : {}),
  }
}

export const hasTalentCriteria = (criteria: CandidateCriteria): boolean =>
  criteria.skills.length + criteria.languages.length + criteria.locations.length + criteria.keywords.length > 0 || criteria.minYearsOfExperience !== undefined
