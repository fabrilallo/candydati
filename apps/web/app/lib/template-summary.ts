import type { JobContent } from '@candydati/domain'
import type { Translate } from './ad-text'

export type TemplateFactKey = 'salary' | 'stages' | 'requirements' | 'responsibilities' | 'benefits'
export interface TemplateFact {
  readonly key: TemplateFactKey
  readonly count: number
}

/** What a template pre-fills, in reading order. Only what is actually set. */
export const templateFacts = (content: JobContent): readonly TemplateFact[] => {
  const requirements = content.requirements.mustHave.length + content.requirements.niceToHave.length
  const candidates: readonly TemplateFact[] = [
    { key: 'salary', count: 0 },
    { key: 'stages', count: content.process.length },
    { key: 'requirements', count: requirements },
    { key: 'responsibilities', count: content.responsibilities.length },
    { key: 'benefits', count: content.benefits.length },
  ]
  const hasSalary = content.salary.min !== undefined || content.salary.max !== undefined
  return candidates.filter((fact) => (fact.key === 'salary' ? hasSalary : fact.count > 0))
}

/** "RAL, processo in 3 fasi, 5 requisiti". */
export const templateSummary = (content: JobContent, tr: Translate): string => {
  const facts = templateFacts(content)
  if (facts.length === 0) return tr('job.templates.facts.none')
  return facts.map(({ key, count }) => tr(`job.templates.facts.${key}`, key === 'salary' ? {} : { count })).join(', ')
}
