import { automationActionSchema, RESPONSE_STATES } from '@tt/domain'
import { z } from 'zod'

/**
 * TEMPORARY mirror of the Phase 4 wire DTOs (phase 4 contract, "HTTP"). Constants, permissions and input schemas come
 * from `@tt/domain`; the response shapes are not exported anywhere yet, so they live here, in this one file, until the
 * api mappers land and the domain (or a shared DTO module) exports them. Where the contract leaves a field open, the
 * schema accepts both plausible spellings and normalises them.
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

export const automationRuleSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  stageId: z.string(),
  action: automationActionSchema,
  enabled: z.boolean(),
  createdBy: personRef,
  createdAt: isoDate,
})
export type AutomationRuleDto = z.infer<typeof automationRuleSchema>

export const webhookEndpointSchema = z.object({ id: z.string(), url: z.string(), events: z.array(z.string()), enabled: z.boolean(), createdAt: isoDate })
export type WebhookEndpointDto = z.infer<typeof webhookEndpointSchema>
/** Only the create answer carries the secret, and only once. */
export const webhookCreatedSchema = webhookEndpointSchema.extend({ secret: z.string().min(1) })
export type WebhookCreatedDto = z.infer<typeof webhookCreatedSchema>

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
