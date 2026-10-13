import { checkWebhookUrl, JOB_OWNER_ASSIGNEE, MAX_DUE_IN_DAYS, TASK_TITLE_MAX, WEBHOOK_EVENT_TYPES, type AutomationActionType } from '@tt/domain'
import type { RuleInput } from './automation-api'
import type { AutomationRuleDto, WebhookDeliveryDto } from './phase4-contract'

/** Pure: the rules of each stage, in the order of the stages and then of creation. Rules of unknown stages are left out. */
export const rulesByStage = (rules: readonly AutomationRuleDto[], stageIds: readonly string[]): Readonly<Record<string, readonly AutomationRuleDto[]>> =>
  Object.fromEntries(stageIds.map((stageId) => [stageId, rules.filter((rule) => rule.stageId === stageId).toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))]))

export interface RuleForm {
  readonly type: AutomationActionType
  readonly templateId: string
  readonly title: string
  /** `job_owner` or a member's user id. */
  readonly assignee: string
  /** Whole days as typed, or empty for no due date. */
  readonly dueInDays: string
}

export const EMPTY_RULE_FORM: RuleForm = { type: 'send_template', templateId: '', title: '', assignee: JOB_OWNER_ASSIGNEE, dueInDays: '' }

export const ruleToForm = (rule: AutomationRuleDto): RuleForm =>
  rule.action.type === 'send_template'
    ? { ...EMPTY_RULE_FORM, templateId: rule.action.templateId }
    : { ...EMPTY_RULE_FORM, type: 'create_task', title: rule.action.title, assignee: rule.action.assignee, dueInDays: rule.action.dueInDays === undefined ? '' : String(rule.action.dueInDays) }

export type RuleFormErrors = Partial<Record<keyof RuleForm, string>>

/** Pure: errors as translation keys, or the body to send. Only the fields of the chosen action travel. */
export const validateRuleForm = (form: RuleForm, stageId: string, enabled: boolean): { readonly errors: RuleFormErrors; readonly input: RuleInput | null } => {
  if (form.type === 'send_template') {
    return form.templateId === '' ? { errors: { templateId: 'automations.errors.templateRequired' }, input: null } : { errors: {}, input: { stageId, enabled, action: { type: 'send_template', templateId: form.templateId } } }
  }
  const title = form.title.trim()
  const days = form.dueInDays.trim() === '' ? null : Number(form.dueInDays)
  const errors: RuleFormErrors = {
    ...(title === '' ? { title: 'tasks.errors.titleRequired' } : title.length > TASK_TITLE_MAX ? { title: 'tasks.errors.titleTooLong' } : {}),
    ...(form.assignee === '' ? { assignee: 'tasks.errors.assigneeRequired' } : {}),
    ...(days !== null && !(Number.isInteger(days) && days >= 0 && days <= MAX_DUE_IN_DAYS) ? { dueInDays: 'automations.errors.dueInDays' } : {}),
  }
  if (Object.keys(errors).length > 0) return { errors, input: null }
  return { errors, input: { stageId, enabled, action: { type: 'create_task', title, assignee: form.assignee, ...(days === null ? {} : { dueInDays: days }) } } }
}

export interface RuleWords {
  readonly key: string
  readonly params: Readonly<Record<string, string | number>>
}

interface Names {
  readonly template: (id: string) => string | null
  readonly member: (id: string) => string | null
}

/** Pure: what a rule does, as a translation key and its values (the sentence after "Quando una candidatura entra in …:"). */
export const describeRule = (rule: AutomationRuleDto, names: Names): RuleWords => {
  const action = rule.action
  if (action.type === 'send_template') {
    const template = names.template(action.templateId)
    return template === null ? { key: 'automations.rule.sendMissingTemplate', params: {} } : { key: 'automations.rule.sendTemplate', params: { template } }
  }
  const owner = action.assignee === JOB_OWNER_ASSIGNEE
  const member = owner ? null : names.member(action.assignee)
  const due = action.dueInDays ?? null
  return {
    key: `automations.rule.${owner ? 'taskForOwner' : 'taskForMember'}${due === null ? '' : 'Due'}`,
    params: { title: action.title, ...(owner ? {} : { member: member ?? '?' }), ...(due === null ? {} : { count: due }) },
  }
}

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

export type DeliveryTone = 'success' | 'destructive' | 'neutral'

/** Pure: 2xx is delivered, a failure or another code is an error, anything else is still on its way. */
export const deliveryTone = (delivery: Pick<WebhookDeliveryDto, 'status' | 'responseCode' | 'error'>): DeliveryTone => {
  if (delivery.responseCode !== null) return delivery.responseCode >= 200 && delivery.responseCode < 300 ? 'success' : 'destructive'
  if (delivery.status === 'success') return 'success'
  return delivery.status === 'failed' || delivery.error ? 'destructive' : 'neutral'
}
