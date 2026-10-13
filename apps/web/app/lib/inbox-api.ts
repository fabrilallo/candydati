import type { PageMeta } from '@tt/domain'
import { z } from 'zod'
import { callApi } from './api-call'
import type { JobApiRequest } from './job-api'
import { notificationSchema, taskSchema, unreadCountSchema, type NotificationDto, type TaskDto } from './phase4-contract'

/** Notifications and tasks: what the platform asks of the signed-in person (phase 4 contract, HTTP). */
const id = (value: string): string => encodeURIComponent(value)
export const NOTIFICATION_PAGE_SIZE = 20

export const unreadCount = async (request: JobApiRequest): Promise<number> => (await callApi(request, '/api/v1/notifications/unread-count', unreadCountSchema)).data.count

export interface NotificationPage {
  readonly items: readonly NotificationDto[]
  readonly meta: PageMeta | null
}

export const listNotifications = async (request: JobApiRequest, options: { readonly unread?: boolean; readonly page?: number; readonly limit?: number } = {}): Promise<NotificationPage> => {
  const params = new URLSearchParams()
  if (options.unread) params.set('unread', 'true')
  params.set('page', String(options.page ?? 1))
  params.set('limit', String(options.limit ?? NOTIFICATION_PAGE_SIZE))
  const { data, meta } = await callApi(request, `/api/v1/notifications?${params.toString()}`, z.array(notificationSchema))
  return { items: data, meta }
}

/** Marks some notifications as read, or all of them. */
export const markRead = async (request: JobApiRequest, target: { readonly ids: readonly string[] } | { readonly all: true }): Promise<void> => {
  await callApi(request, '/api/v1/notifications/read', z.unknown(), { method: 'POST', body: target })
}

export interface TaskInput {
  readonly title: string
  readonly assigneeId: string
  readonly dueAt: string | null
  readonly applicationId: string | null
  readonly jobId: string | null
}

export const listMyTasks = async (request: JobApiRequest): Promise<readonly TaskDto[]> => (await callApi(request, '/api/v1/tasks?mine=true&open=true', z.array(taskSchema))).data

export const listApplicationTasks = async (request: JobApiRequest, applicationId: string): Promise<readonly TaskDto[]> =>
  (await callApi(request, `/api/v1/applications/${id(applicationId)}/tasks`, z.array(taskSchema))).data

/** Only the fields that are set travel: no due date means none, no application means a task on its own. */
export const createTask = async (request: JobApiRequest, input: TaskInput): Promise<TaskDto> => {
  const body = {
    title: input.title,
    assigneeId: input.assigneeId,
    ...(input.dueAt ? { dueAt: input.dueAt } : {}),
    ...(input.applicationId ? { applicationId: input.applicationId } : {}),
    ...(input.jobId ? { jobId: input.jobId } : {}),
  }
  return (await callApi(request, '/api/v1/tasks', taskSchema, { method: 'POST', body })).data
}

export const setTaskDone = async (request: JobApiRequest, taskId: string, done: boolean): Promise<TaskDto> =>
  (await callApi(request, `/api/v1/tasks/${id(taskId)}/${done ? 'complete' : 'reopen'}`, taskSchema, { method: 'POST', body: {} })).data
