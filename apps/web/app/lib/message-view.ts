import { EMAIL_TEMPLATE_KINDS, SYSTEM_SENDER, type EmailTemplateKind, type MessageStatus, type Outcome, type TemplateVariable, type EmailTemplateDto, type MessageDto } from '@candydati/domain'

export type MessageTone = 'secondary' | 'success' | 'destructive'

export interface MessageView {
  readonly side: 'outbound' | 'inbound'
  /** Who wrote it; null when a translation key names it instead (the system). */
  readonly author: string | null
  readonly authorKey: string | null
  /** Delivery state of what we sent; inbound messages have none. */
  readonly statusKey: string | null
  readonly tone: MessageTone
  readonly at: string
  readonly unverified: boolean
  /** Why a delivery failed, as a translation key (the api sends a short code, never the provider's text). */
  readonly errorKey: string | null
}

const DELIVERY_ERRORS = ['delivery_failed', 'delivery_rejected', 'recipient_missing', 'queue_unavailable'] as const

/** Pure: translation key of a delivery error code; unknown codes get the generic one. */
export const deliveryErrorKey = (code: string | null): string =>
  code !== null && (DELIVERY_ERRORS as readonly string[]).includes(code) ? `messages.deliveryErrors.${code}` : 'messages.deliveryErrors.unknown'

const isSystem = (message: MessageDto): boolean => message.sentBy === null || message.sentBy.id === SYSTEM_SENDER

const TONES: Readonly<Record<MessageStatus, MessageTone>> = { queued: 'secondary', sending: 'secondary', sent: 'success', failed: 'destructive', received: 'secondary' }

/** Pure: how one message is drawn in the conversation. */
export const messageView = (message: MessageDto, candidateName: string): MessageView => {
  const inbound = message.direction === 'inbound'
  return {
    side: message.direction,
    author: inbound ? candidateName : isSystem(message) ? null : (message.sentBy?.name ?? null),
    authorKey: !inbound && isSystem(message) ? 'messages.system' : null,
    statusKey: inbound ? null : `messages.status.${message.status}`,
    tone: TONES[message.status],
    at: message.sentAt ?? message.createdAt,
    unverified: inbound && message.unverifiedSender,
    errorKey: message.status === 'failed' ? deliveryErrorKey(message.error) : null,
  }
}

/** Pure: a conversation in reading order, oldest first. */
export const threadOf = (messages: readonly MessageDto[]): readonly MessageDto[] => messages.toSorted((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))

const OUTCOME_KINDS: Readonly<Record<Outcome, EmailTemplateKind | null>> = { not_selected: 'outcome_not_selected', hired: 'outcome_hired', withdrawn: null }

/** Pure: the template to propose after an outcome. A withdrawal comes from the candidate: nothing to propose. */
export const outcomeTemplateKind = (outcome: Outcome): EmailTemplateKind | null => OUTCOME_KINDS[outcome]

/** Pure: the active template of a kind, the organization's own before the default. */
export const templateForKind = (templates: readonly EmailTemplateDto[], kind: EmailTemplateKind | null): EmailTemplateDto | null => {
  if (kind === null) return null
  const ofKind = templates.filter((item) => item.kind === kind)
  return ofKind.find((item) => !item.isDefault) ?? ofKind[0] ?? null
}

export interface TemplateGroup {
  readonly kind: EmailTemplateKind
  readonly templates: readonly EmailTemplateDto[]
}

/** Pure: templates grouped by kind, in the order of `EMAIL_TEMPLATE_KINDS`, empty kinds left out. */
export const templateGroups = (templates: readonly EmailTemplateDto[]): readonly TemplateGroup[] =>
  EMAIL_TEMPLATE_KINDS.map((kind) => ({ kind, templates: templates.filter((item) => item.kind === kind) })).filter((group) => group.templates.length > 0)

/** Pure: how many messages across applications; null if any count is unknown (never a made-up number). */
export const messageTotal = (applications: readonly { readonly messageCount: number | null }[]): number | null =>
  applications.reduce<number | null>((sum, app) => (sum === null || app.messageCount === null ? null : sum + app.messageCount), 0)

export interface SampleInput {
  readonly firstName: string
  readonly lastName: string
  readonly jobTitle: string
  readonly stageName: string
  readonly organizationName: string
  readonly careersUrl: string
}

export const SAMPLE_RESPONSE_DAYS = 10

/** Pure: values for every variable, to preview a template without a real candidate. */
export const sampleValues = (input: SampleInput): Readonly<Record<TemplateVariable, string>> => ({
  'candidate.firstName': input.firstName,
  'candidate.lastName': input.lastName,
  'job.title': input.jobTitle,
  'organization.name': input.organizationName,
  'stage.name': input.stageName,
  'job.responseDays': String(SAMPLE_RESPONSE_DAYS),
  'job.url': input.careersUrl,
})
