import { automationRuleInputSchema, RESPONSE_STATES, webhookEndpointInputSchema } from '@tt/domain'
import { z } from 'zod'

/**
 * Web-only wire DTOs of Phase 4 (phase 4 contract, "HTTP"). Rules and webhook endpoints are the domain's input
 * schemas extended with what the api adds; the rest (notifications, tasks, attention, deliveries, counts) has no
 * shared DTO in `@tt/domain`, so it stays here. These are deliberately lenient where the web must keep working when
 * the api grows: a notification `kind` or a delivery `eventType` the web does not know still shows, generically.
 */
const isoDate = z.iso.datetime({ offset: true })

/** The issue `closeJob` answers with while applications are open: `open_applications:<count>`. */
export const OPEN_APPLICATIONS_PREFIX = 'open_applications:'

/** Fields the contract adds to `ApplicationCardDto` and to the applications of the candidate detail. */
export const responseFields = {
  responseDueAt: isoDate.nullable().default(null),
  respondedAt: isoDate.nullable().default(null),
  responseState: z.enum(RESPONSE_STATES).nullable().default(null),
}

const candidateRef = z.object({ id: z.string(), firstName: z.string(), lastName: z.string() })

export const attentionItemSchema = z.object({
  applicationId: z.string(),
  candidate: candidateRef,
  job: z.object({ id: z.string(), title: z.string() }),
  stage: z.object({ id: z.string(), label: z.string().nullable() }),
  responseDueAt: isoDate,
  state: z.enum(RESPONSE_STATES),
  ownerName: z.string().nullable(),
})
export type AttentionItemDto = z.infer<typeof attentionItemSchema>

export const notificationSchema = z.object({
  id: z.string(),
  /** A kind the web does not know yet still shows, with a generic wording. */
  kind: z.string(),
  applicationId: z.string().nullable().default(null),
  jobId: z.string().nullable().default(null),
  taskId: z.string().nullable().default(null),
  payload: z.record(z.string(), z.unknown()).default({}),
  /** Resolved by the use case (`loadRefs`): who and which job, when known. */
  candidate: candidateRef.nullable().default(null),
  jobTitle: z.string().nullable().default(null),
  createdAt: isoDate,
  readAt: isoDate.nullable(),
})
export type NotificationDto = z.infer<typeof notificationSchema>

/** The contract names the route, not the field: `count` (or `unread`) is accepted. */
export const unreadCountSchema = z.union([z.object({ count: z.number().int().nonnegative() }), z.object({ unread: z.number().int().nonnegative() }).transform(({ unread }) => ({ count: unread }))])

/** An author as an id (domain shape) or as `{ id, name }`. */
const personRef = z.union([z.string().transform((id) => ({ id, name: null as string | null })), z.object({ id: z.string(), name: z.string().nullable() })])

/** The api sends `assignee: { id, name }`; the contract text says `assigneeId`. Both become `assigneeId` + `assigneeName`. */
const flattenAssignee = (raw: unknown): unknown => {
  if (typeof raw !== 'object' || raw === null || !('assignee' in raw)) return raw
  const { assignee, ...rest } = raw as { assignee: unknown } & Record<string, unknown>
  if (typeof assignee !== 'object' || assignee === null) return raw
  const person = assignee as { id?: unknown; name?: unknown }
  return { ...rest, assigneeId: rest.assigneeId ?? person.id, assigneeName: rest.assigneeName ?? person.name ?? null }
}

const taskObject = z.object({
  id: z.string(),
  applicationId: z.string().nullable().default(null),
  jobId: z.string().nullable().default(null),
  title: z.string(),
  assigneeId: z.string(),
  assigneeName: z.string().nullable().default(null),
  dueAt: isoDate.nullable().default(null),
  createdBy: personRef,
  createdAt: isoDate,
  completedAt: isoDate.nullable().default(null),
  /** Context for "Le mie attività"; absent on the tasks of one application. */
  candidate: candidateRef.nullable().default(null),
  job: z.object({ id: z.string(), title: z.string() }).nullable().default(null),
  jobTitle: z.string().nullable().default(null),
})
export const taskSchema = z.preprocess(flattenAssignee, taskObject)
export type TaskDto = z.output<typeof taskObject>

/** The domain's rule input (stage, action, enabled) plus what the api adds. */
export const automationRuleSchema = automationRuleInputSchema.extend({
  id: z.string(),
  jobId: z.string(),
  enabled: z.boolean(),
  createdBy: personRef,
  createdAt: isoDate,
})
export type AutomationRuleDto = z.output<typeof automationRuleSchema>

/** The domain's endpoint input (url, known events, enabled) plus what the api adds. */
export const webhookEndpointSchema = webhookEndpointInputSchema.extend({ id: z.string(), enabled: z.boolean(), createdAt: isoDate })
export type WebhookEndpointDto = z.output<typeof webhookEndpointSchema>
/** Only the create answer carries the secret, and only once. */
export const webhookCreatedSchema = webhookEndpointSchema.extend({ secret: z.string().min(1) })
export type WebhookCreatedDto = z.output<typeof webhookCreatedSchema>

export const webhookDeliverySchema = z
  .object({
    id: z.string(),
    eventType: z.string().optional(),
    event: z.string().optional(),
    status: z.string(),
    responseCode: z.number().int().nullable(),
    attempt: z.number().int().nonnegative(),
    error: z.string().nullable(),
    createdAt: isoDate,
  })
  .transform(({ event, eventType, ...rest }) => ({ ...rest, eventType: eventType ?? event ?? null }))
export type WebhookDeliveryDto = z.output<typeof webhookDeliverySchema>

export const decidedSchema = z.object({ decided: z.number().int().nonnegative() })
