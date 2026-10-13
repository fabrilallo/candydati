import type { AttentionItemDto, AutomationRuleDto, NotificationDto, TaskDto, WebhookEndpointDto } from '../../app/lib/phase4-contract'

/** Phase 4 DTOs as the api would send them (phase 4 contract). */
export const P4_NOW = '2026-10-13T10:00:00.000Z'

export const attentionItem = (applicationId: string, overrides: Partial<AttentionItemDto> = {}): AttentionItemDto => ({
  applicationId,
  candidate: { id: `c-${applicationId}`, firstName: 'Giulia', lastName: `Rossi ${applicationId}` },
  job: { id: 'j1', title: 'Backend developer' },
  stage: { id: 'stage-0', label: 'Chiamata conoscitiva' },
  responseDueAt: '2026-10-11T10:00:00.000Z',
  state: 'overdue',
  ownerName: 'Ada Lovelace',
  ...overrides,
})

export const notification = (id: string, overrides: Partial<NotificationDto> = {}): NotificationDto => ({
  id,
  kind: 'response_overdue',
  applicationId: 'a1',
  jobId: 'j1',
  taskId: null,
  payload: {},
  candidate: { id: 'c1', firstName: 'Giulia', lastName: 'Rossi' },
  jobTitle: 'Backend developer',
  createdAt: P4_NOW,
  readAt: null,
  ...overrides,
})

export const task = (id: string, overrides: Partial<TaskDto> = {}): TaskDto => ({
  id,
  applicationId: 'a1',
  jobId: 'j1',
  title: 'Chiamare per il feedback',
  assigneeId: 'u1',
  assigneeName: 'Ada',
  dueAt: '2026-10-14T16:00:00.000Z',
  createdBy: { id: 'u1', name: 'Ada' },
  createdAt: P4_NOW,
  completedAt: null,
  candidate: { id: 'c1', firstName: 'Giulia', lastName: 'Rossi' },
  job: { id: 'j1', title: 'Backend developer' },
  jobTitle: null,
  ...overrides,
})

export const rule = (id: string, overrides: Partial<AutomationRuleDto> = {}): AutomationRuleDto => ({
  id,
  jobId: 'j1',
  stageId: 'stage-0',
  enabled: true,
  createdBy: { id: 'u1', name: 'Ada' },
  createdAt: P4_NOW,
  action: { type: 'send_template', templateId: 't-update' },
  ...overrides,
})

export const taskAction = (title: string, assignee = 'job_owner', dueInDays?: number): AutomationRuleDto['action'] => ({ type: 'create_task', title, assignee, ...(dueInDays === undefined ? {} : { dueInDays }) })

export const webhook = (id: string, overrides: Partial<WebhookEndpointDto> = {}): WebhookEndpointDto => ({
  id,
  url: 'https://hooks.example.com/tt',
  events: ['application.received', 'job.closed'],
  enabled: true,
  createdAt: P4_NOW,
  ...overrides,
})
