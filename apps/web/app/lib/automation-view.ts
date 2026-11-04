import { type AutomationRuleDto, type WebhookDeliveryDto, checkWebhookUrl, WEBHOOK_EVENT_TYPES } from '@candydati/domain'
import type { RuleInput } from './automation-api'
import { actionToForm, describeAction, EMPTY_ACTION_FORM, validateAction, type ActionForm, type ActionFormErrors, type Names, type RuleWords } from './automation-action-view'
import { EMPTY_TRIGGER_FORM, triggerToForm, validateTriggerForm, type TriggerForm, type TriggerFormErrors } from './automation-trigger-view'

export type { Names, RuleWords } from './automation-action-view'

/** Pure: the rules of each stage, in the order of the stages and then of creation. Rules of unknown stages are left out. */
export const rulesByStage = (rules: readonly AutomationRuleDto[], stageIds: readonly string[]): Readonly<Record<string, readonly AutomationRuleDto[]>> =>
  Object.fromEntries(stageIds.map((stageId) => [stageId, rules.filter((rule) => rule.stageId === stageId).toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))]))

/** The whole rule form: its trigger and conditions (`TriggerForm`) and its action (`ActionForm`). */
export type RuleForm = TriggerForm & ActionForm

export const EMPTY_RULE_FORM: RuleForm = { ...EMPTY_TRIGGER_FORM, ...EMPTY_ACTION_FORM }

export const ruleToForm = (rule: AutomationRuleDto): RuleForm => ({ ...EMPTY_RULE_FORM, ...triggerToForm(rule), ...actionToForm(rule.action) })

export type RuleFormErrors = TriggerFormErrors & ActionFormErrors

/** Pure: errors as translation keys, or the body to send: trigger, conditions that are set, and the fields of the chosen action. */
export const validateRuleForm = (form: RuleForm, stageId: string, enabled: boolean): { readonly errors: RuleFormErrors; readonly input: RuleInput | null } => {
  const when = validateTriggerForm(form)
  const what = validateAction(form, stageId)
  const errors: RuleFormErrors = { ...when.errors, ...what.errors }
  if (!when.value || !what.action) return { errors, input: null }
  return { errors, input: { stageId, ...when.value, enabled, action: what.action } }
}

/** Pure: what a rule does, as a translation key and its values (the sentence after "When …:"). */
export const describeRule = (rule: Pick<AutomationRuleDto, 'action'>, names: Names, joinList?: (items: readonly string[]) => string): RuleWords =>
  describeAction(rule.action, names, joinList)

export interface WebhookForm {
  readonly url: string
  readonly events: readonly string[]
}

/** Pure: an event switched on or off, in the canonical order of the events. */
export const toggleEvent = (events: readonly string[], event: string): readonly string[] => {
  const known: readonly string[] = WEBHOOK_EVENT_TYPES
  const next = events.includes(event) ? events.filter((item) => item !== event) : [...events, event]
  return [...known.filter((item) => next.includes(item)), ...next.filter((item) => !known.includes(item))]
}

/**
 * Pure: errors of a webhook form as translation keys, with the domain's address rules. Loopback over http passes here
 * (it is allowed when the server runs with `WEBHOOKS_ALLOW_PRIVATE`); the api has the last word.
 */
export const validateWebhookForm = (form: WebhookForm): Partial<Record<keyof WebhookForm, string>> => {
  const issue = checkWebhookUrl(form.url.trim(), true)
  return {
    ...(issue ? { url: `webhooks.errors.${issue}` } : {}),
    ...(form.events.length === 0 ? { events: 'webhooks.errors.events' } : {}),
  }
}

export type DeliveryTone = 'success' | 'destructive'

/** Pure: a delivery either reached the endpoint with a 2xx (`success`) or it did not (`failed`). */
export const deliveryTone = (delivery: Pick<WebhookDeliveryDto, 'status'>): DeliveryTone => (delivery.status === 'success' ? 'success' : 'destructive')
