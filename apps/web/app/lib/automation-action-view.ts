import {
  JOB_OWNER_ASSIGNEE,
  MAX_DUE_IN_DAYS,
  MAX_NOTIFY_RECIPIENTS,
  TAG_MAX,
  TASK_TITLE_MAX,
  type AutomationAction,
  type AutomationActionInput,
  type AutomationActionType,
  type NotifyChannel,
} from '@candydati/domain'

/** The action part of the rule form: every action's fields, as typed. */
export interface ActionForm {
  readonly type: AutomationActionType
  readonly templateId: string
  readonly title: string
  /** `job_owner` or a member's user id (tasks and assignments). */
  readonly assignee: string
  /** Whole days as typed, or empty for no due date. */
  readonly dueInDays: string
  readonly tag: string
  readonly channel: NotifyChannel
  /** `job_owner` and members' user ids, for in-app and email alerts. */
  readonly recipients: readonly string[]
  readonly toStageId: string
}

export const EMPTY_ACTION_FORM: ActionForm = {
  type: 'send_template',
  templateId: '',
  title: '',
  assignee: JOB_OWNER_ASSIGNEE,
  dueInDays: '',
  tag: '',
  channel: 'in_app',
  recipients: [JOB_OWNER_ASSIGNEE],
  toStageId: '',
}

const daysText = (days: number | undefined): string => (days === undefined ? '' : String(days))

/** Pure: a stored action back into the form, every other field left empty. */
export function actionToForm(action: AutomationAction): ActionForm {
  const base = { ...EMPTY_ACTION_FORM, type: action.type }
  switch (action.type) {
    case 'send_template':
      return { ...base, templateId: action.templateId }
    case 'create_task':
      return { ...base, title: action.title, assignee: action.assignee, dueInDays: daysText(action.dueInDays) }
    case 'assign':
      return { ...base, assignee: action.assignee, dueInDays: daysText(action.dueInDays) }
    case 'add_tag':
      return { ...base, tag: action.tag }
    case 'notify':
      return { ...base, channel: action.channel, recipients: action.recipients }
    case 'propose_move':
      return { ...base, toStageId: action.toStageId }
    case 'request_feedback':
      return base
  }
}

export type ActionFormErrors = Partial<Record<keyof ActionForm, string>>
export type ActionResult = { readonly errors: ActionFormErrors; readonly action: AutomationActionInput | null }

const fail = (errors: ActionFormErrors): ActionResult => ({ errors, action: null })
const pass = (action: AutomationActionInput): ActionResult => ({ errors: {}, action })

/** The due days as a number, `null` for none, or `undefined` when they are not a whole number from 0 to 90. */
function dueDays(text: string): number | null | undefined {
  if (text.trim() === '') return null
  const days = Number(text)
  return Number.isInteger(days) && days >= 0 && days <= MAX_DUE_IN_DAYS ? days : undefined
}

function validateTask(form: ActionForm): ActionResult {
  const title = form.title.trim()
  const days = dueDays(form.dueInDays)
  const errors: ActionFormErrors = {
    ...(title === '' ? { title: 'tasks.errors.titleRequired' } : title.length > TASK_TITLE_MAX ? { title: 'tasks.errors.titleTooLong' } : {}),
    ...(form.assignee === '' ? { assignee: 'tasks.errors.assigneeRequired' } : {}),
    ...(days === undefined ? { dueInDays: 'automations.errors.dueInDays' } : {}),
  }
  if (Object.keys(errors).length > 0 || days === undefined) return fail(errors)
  return pass({ type: 'create_task', title, assignee: form.assignee, ...(days === null ? {} : { dueInDays: days }) })
}

function validateAssign(form: ActionForm): ActionResult {
  const days = dueDays(form.dueInDays)
  if (form.assignee === '') return fail({ assignee: 'tasks.errors.assigneeRequired' })
  if (days === undefined) return fail({ dueInDays: 'automations.errors.dueInDays' })
  return pass({ type: 'assign', assignee: form.assignee, ...(days === null ? {} : { dueInDays: days }) })
}

function validateTag(form: ActionForm): ActionResult {
  const tag = form.tag.trim().toLowerCase()
  if (tag === '' || tag.length > TAG_MAX) return fail({ tag: 'automations.errors.tag' })
  return pass({ type: 'add_tag', tag })
}

function validateNotify(form: ActionForm): ActionResult {
  if (form.channel === 'webhook') return pass({ type: 'notify', channel: 'webhook', recipients: [] })
  const recipients = [...new Set(form.recipients)]
  if (recipients.length === 0 || recipients.length > MAX_NOTIFY_RECIPIENTS) return fail({ recipients: 'automations.errors.recipients' })
  return pass({ type: 'notify', channel: form.channel, recipients })
}

/** Pure: errors as translation keys, or the action to send. `stageId` is the rule's own stage, which a move cannot target. */
export function validateAction(form: ActionForm, stageId: string): ActionResult {
  switch (form.type) {
    case 'send_template':
      return form.templateId === '' ? fail({ templateId: 'automations.errors.templateRequired' }) : pass({ type: 'send_template', templateId: form.templateId })
    case 'create_task':
      return validateTask(form)
    case 'assign':
      return validateAssign(form)
    case 'add_tag':
      return validateTag(form)
    case 'notify':
      return validateNotify(form)
    case 'request_feedback':
      return pass({ type: 'request_feedback' })
    case 'propose_move':
      return form.toStageId === '' || form.toStageId === stageId ? fail({ toStageId: 'automations.errors.toStage' }) : pass({ type: 'propose_move', toStageId: form.toStageId })
  }
}

export interface RuleWords {
  readonly key: string
  readonly params: Readonly<Record<string, string | number>>
}

export interface Names {
  readonly template: (id: string) => string | null
  readonly member: (id: string) => string | null
  /** The name of a stage of the job the rule belongs to. */
  readonly stage: (id: string) => string | null
  /** How the job owner is named in a list of people (the translated "job owner"). */
  readonly owner: string
}

const person = (id: string, names: Names): string | null => (id === JOB_OWNER_ASSIGNEE ? null : (names.member(id) ?? '?'))

function describeTask(action: { readonly title?: string; readonly assignee: string; readonly dueInDays?: number | undefined }, prefix: 'task' | 'assign', names: Names): RuleWords {
  const member = person(action.assignee, names)
  const due = action.dueInDays ?? null
  return {
    key: `automations.rule.${prefix}${member === null ? 'ForOwner' : 'ForMember'}${due === null ? '' : 'Due'}`,
    params: { ...(action.title === undefined ? {} : { title: action.title }), ...(member === null ? {} : { member }), ...(due === null ? {} : { count: due }) },
  }
}

function describeNotify(action: Extract<AutomationAction, { type: 'notify' }>, names: Names, joinList: (items: readonly string[]) => string): RuleWords {
  if (action.channel === 'webhook') return { key: 'automations.rule.notifyWebhook', params: {} }
  const people = action.recipients.map((id) => person(id, names) ?? names.owner)
  return { key: `automations.rule.notify_${action.channel}`, params: { people: joinList(people) } }
}

/**
 * Pure: what a rule does, as a translation key and its values (the sentence after "When …:"). `joinList` joins the
 * people of an alert.
 */
export function describeAction(action: AutomationAction, names: Names, joinList: (items: readonly string[]) => string = (items) => items.join(', ')): RuleWords {
  switch (action.type) {
    case 'send_template': {
      const template = names.template(action.templateId)
      return template === null ? { key: 'automations.rule.sendMissingTemplate', params: {} } : { key: 'automations.rule.sendTemplate', params: { template } }
    }
    case 'create_task':
      return describeTask(action, 'task', names)
    case 'assign':
      return describeTask(action, 'assign', names)
    case 'add_tag':
      return { key: 'automations.rule.addTag', params: { tag: action.tag } }
    case 'request_feedback':
      return { key: 'automations.rule.requestFeedback', params: {} }
    case 'notify':
      return describeNotify(action, names, joinList)
    case 'propose_move':
      return { key: 'automations.rule.proposeMove', params: { stage: names.stage(action.toStageId) ?? '?' } }
  }
}
