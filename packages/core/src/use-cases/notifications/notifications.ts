import type { Notification } from '@tt/domain';
import { z } from 'zod';
import { toActorUserId } from '../../actor-user.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../list-audit-log.js';
import { loadRefs, type CandidateRef } from '../refs.js';
import { defineNotificationUseCase } from './define.js';

export interface NotificationView {
  readonly notification: Notification;
  readonly candidate: CandidateRef | null;
  readonly jobTitle: string | null;
}

export interface NotificationPage {
  readonly items: readonly NotificationView[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

const OWN = 'a person only ever reads and changes their own notifications; the organization scope still applies';

export const listNotifications = defineNotificationUseCase({
  name: 'listNotifications',
  input: z.object({
    unread: z.boolean().default(false),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  }),
  permission: { skip: OWN },
  audit: { skip: 'read-only, own notifications' },
  handler: async ({ deps, actor, input }): Promise<NotificationPage> => {
    const { items, total } = await deps.notifications.list({
      organizationId: actor.organizationId,
      userId: toActorUserId(actor),
      unreadOnly: input.unread,
      page: input.page,
      limit: input.limit,
    });
    const refs = await loadRefs(deps, actor.organizationId, items.map((n) => n.applicationId), items.map((n) => n.jobId));
    const views = items.map((notification) => ({
      notification,
      candidate: refs.candidateOf(notification.applicationId),
      jobTitle: refs.jobTitleOf(notification.jobId),
    }));
    return { items: views, total, page: input.page, limit: input.limit };
  },
});

export const markNotificationsRead = defineNotificationUseCase({
  name: 'markNotificationsRead',
  input: z
    .object({ ids: z.array(z.string().min(1)).min(1).max(200).optional(), all: z.literal(true).optional() })
    .refine((input) => (input.ids === undefined) !== (input.all === undefined), 'ids_or_all'),
  permission: { skip: OWN },
  audit: { skip: 'marking own notifications as read is not an action on candidate data' },
  handler: async ({ deps, actor, input }): Promise<{ readonly updated: number }> => ({
    updated: await deps.notifications.markRead(actor.organizationId, toActorUserId(actor), input.ids, deps.now()),
  }),
});

export const unreadNotificationCount = defineNotificationUseCase({
  name: 'unreadNotificationCount',
  input: z.object({}),
  permission: { skip: OWN },
  audit: { skip: 'read-only, own notifications' },
  handler: async ({ deps, actor }): Promise<{ readonly count: number }> => ({
    count: await deps.notifications.unreadCount(actor.organizationId, toActorUserId(actor)),
  }),
});
