import { normalizeSkill, SKILL_TERM_MAX, type BuiltInSkillDto } from '@candydati/domain'

/** Pure: the built-in skills whose name or any alias matches what was typed (case, punctuation and accents ignored). */
export const filterBuiltIn = (entries: readonly BuiltInSkillDto[], query: string): readonly BuiltInSkillDto[] => {
  const wanted = normalizeSkill(query)
  if (query.trim() === '') return entries
  return entries.filter((entry) => [entry.name, ...entry.aliases.map((item) => item.alias)].some((form) => normalizeSkill(form).includes(wanted)))
}

export interface SkillAliasForm {
  readonly skill: string
  readonly alias: string
}

/** Pure: the translation key of what is wrong with the form, per field; empty when it can be sent. */
export const validateSkillAliasForm = (form: SkillAliasForm): Partial<Record<keyof SkillAliasForm, string>> => {
  const problem = (text: string): string | undefined => {
    const trimmed = text.trim()
    if (trimmed === '' || !/[\p{L}\p{N}]/u.test(trimmed)) return 'skills.errors.required'
    return trimmed.length > SKILL_TERM_MAX ? 'skills.errors.tooLong' : undefined
  }
  const skill = problem(form.skill)
  const alias = problem(form.alias)
  return { ...(skill ? { skill } : {}), ...(alias ? { alias } : {}) }
}
