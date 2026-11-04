import {
  type ApplicationSource,
  type AutomationConditions,
  type AutomationRuleDto,
  type AutomationTrigger,
  type AutomationTriggerType,
  type ConsentScope,
  MAX_CONDITION_TAGS,
  MAX_DUE_SOON_DAYS,
  MAX_STUCK_DAYS,
  TAG_MAX,
} from '@candydati/domain'

/** The trigger and the conditions of the rule form. Days and tags as typed. */
export interface TriggerForm {
  readonly trigger: AutomationTriggerType
  /** Days in the stage (`stage_stuck`) or before the deadline (`response_due_soon`). */
  readonly triggerDays: string
  readonly sources: readonly ApplicationSource[]
  readonly consentScopes: readonly ConsentScope[]
  /** Comma-separated. */
  readonly tags: string
}

const DEFAULT_DAYS: Partial<Record<AutomationTriggerType, string>> = { stage_stuck: '5', response_due_soon: '2' }

export const EMPTY_TRIGGER_FORM: TriggerForm = { trigger: 'stage_entered', triggerDays: '', sources: [], consentScopes: [], tags: '' }

/** Pure: the days field a trigger starts with when chosen (its default), or what was typed when it has days already. */
export const daysFor = (trigger: AutomationTriggerType, typed: string): string => (typed === '' ? (DEFAULT_DAYS[trigger] ?? '') : typed)

export const triggerToForm = (rule: Pick<AutomationRuleDto, 'trigger' | 'conditions'>): TriggerForm => {
  const { trigger, conditions } = rule
  const days = trigger.type === 'stage_stuck' ? trigger.days : trigger.type === 'response_due_soon' ? trigger.daysBefore : null
  return {
    trigger: trigger.type,
    triggerDays: days === null ? '' : String(days),
    sources: conditions.sources ?? [],
    consentScopes: conditions.consentScopes ?? [],
    tags: (conditions.tags ?? []).join(', '),
  }
}

/** Pure: lowercase, trimmed, unique, without empty ones (the profile stores tags the same way). */
export const parseTags = (text: string): readonly string[] => [
  ...new Set(
    text
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag !== ''),
  ),
]

/** Pure: a checkbox value switched on or off, in the order of `all`. */
export const toggleIn = <T extends string>(list: readonly T[], value: T, all: readonly T[]): readonly T[] => {
  const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
  return all.filter((item) => next.includes(item))
}

export type TriggerFormErrors = Partial<Record<'triggerDays' | 'tags', string>>

const wholeIn = (text: string, min: number, max: number): number | null => {
  const value = Number(text)
  return text.trim() !== '' && Number.isInteger(value) && value >= min && value <= max ? value : null
}

function buildTrigger(form: TriggerForm): { readonly trigger: AutomationTrigger | null; readonly error?: string } {
  if (form.trigger === 'stage_stuck') {
    const days = wholeIn(form.triggerDays, 1, MAX_STUCK_DAYS)
    return days === null ? { trigger: null, error: 'automations.errors.stuckDays' } : { trigger: { type: 'stage_stuck', days } }
  }
  if (form.trigger === 'response_due_soon') {
    const daysBefore = wholeIn(form.triggerDays, 1, MAX_DUE_SOON_DAYS)
    return daysBefore === null ? { trigger: null, error: 'automations.errors.dueSoonDays' } : { trigger: { type: 'response_due_soon', daysBefore } }
  }
  return { trigger: { type: form.trigger } }
}

/** Pure: errors as translation keys, or the trigger and the conditions to send (only the conditions that are set). */
export const validateTriggerForm = (
  form: TriggerForm,
): { readonly errors: TriggerFormErrors; readonly value: { readonly trigger: AutomationTrigger; readonly conditions: AutomationConditions } | null } => {
  const built = buildTrigger(form)
  const tags = parseTags(form.tags)
  const errors: TriggerFormErrors = {
    ...(built.error ? { triggerDays: built.error } : {}),
    ...(tags.length > MAX_CONDITION_TAGS || tags.some((tag) => tag.length > TAG_MAX) ? { tags: 'automations.errors.tags' } : {}),
  }
  if (!built.trigger || Object.keys(errors).length > 0) return { errors, value: null }
  const conditions: AutomationConditions = {
    ...(form.sources.length > 0 ? { sources: [...form.sources] } : {}),
    ...(tags.length > 0 ? { tags: [...tags] } : {}),
    ...(form.consentScopes.length > 0 ? { consentScopes: [...form.consentScopes] } : {}),
  }
  return { errors, value: { trigger: built.trigger, conditions } }
}

export interface TriggerWords {
  readonly key: string
  readonly params: Readonly<Record<string, number>>
}

/** Pure: the trigger as a translation key (`automations.trigger.<type>`) and its count of days. */
export const describeTrigger = (trigger: AutomationTrigger): TriggerWords => {
  if (trigger.type === 'stage_stuck') return { key: 'automations.trigger.stage_stuck', params: { count: trigger.days } }
  if (trigger.type === 'response_due_soon') return { key: 'automations.trigger.response_due_soon', params: { count: trigger.daysBefore } }
  return { key: `automations.trigger.${trigger.type}`, params: {} }
}

export interface ConditionPart {
  readonly kind: 'sources' | 'tags' | 'consentScopes'
  readonly values: readonly string[]
}

/** Pure: the conditions that are set, in a fixed order, for the "only if" line of a rule. */
export const conditionParts = (conditions: AutomationConditions): readonly ConditionPart[] => [
  ...(conditions.sources ? [{ kind: 'sources' as const, values: conditions.sources }] : []),
  ...(conditions.tags ? [{ kind: 'tags' as const, values: conditions.tags }] : []),
  ...(conditions.consentScopes ? [{ kind: 'consentScopes' as const, values: conditions.consentScopes }] : []),
]
