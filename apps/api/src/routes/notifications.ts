import { listNotifications, markNotificationsRead, toNotificationDto, unreadNotificationCount } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { asBoolean, asNumber, bodyOf, queryOf } from './request.js';

const withoutUndefined = (input: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));

/** In-app notifications: a person only ever sees and changes their own, so these are session only (an API key has no inbox). */
export function registerNotificationRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.notificationDeps;

  app.get('/api/v1/notifications', async (request) => {
    const query = queryOf(request);
    const input = withoutUndefined({ unread: asBoolean(query.unread), page: asNumber(query.page), limit: asNumber(query.limit) });
    const page = await listNotifications(deps, await ctx.resolveSessionActor(request), input);
    return ok(page.items.map(toNotificationDto), { total: page.total, page: page.page, limit: page.limit });
  });

  app.post('/api/v1/notifications/read', async (request) => ok(await markNotificationsRead(deps, await ctx.resolveSessionActor(request), bodyOf(request))));

  app.get('/api/v1/notifications/unread-count', async (request) => ok(await unreadNotificationCount(deps, await ctx.resolveSessionActor(request), {})));
}
