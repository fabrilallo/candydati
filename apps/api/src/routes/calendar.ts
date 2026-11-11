import { getMyCalendarFeed, getMyVideoRoom, removeCalendarFeed, removeVideoRoom, saveCalendarFeed, saveVideoRoom, updateCalendarPreferences } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { bodyOf } from './request.js';

const NO_STORE = 'no-store';

/** The signed-in person's own calendar link: session only (never an API key), and the address is never sent back. */
export function registerCalendarRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.calendarDeps;
  const actor = ctx.resolveSessionActor;

  app.get('/api/v1/me/calendar-feed', async (request, reply) => reply.header('cache-control', NO_STORE).send(ok(await getMyCalendarFeed(deps, await actor(request), {}))));

  app.put('/api/v1/me/calendar-feed', async (request, reply) =>
    reply.header('cache-control', NO_STORE).send(ok(await saveCalendarFeed(deps, await actor(request), bodyOf(request)))),
  );

  app.patch('/api/v1/me/calendar-feed', async (request, reply) =>
    reply.header('cache-control', NO_STORE).send(ok(await updateCalendarPreferences(deps, await actor(request), bodyOf(request)))),
  );

  app.delete('/api/v1/me/calendar-feed', async (request) => ok(await removeCalendarFeed(deps, await actor(request), {})));

  /** The person's own video room: the link of the video interviews they run. */
  app.get('/api/v1/me/video-room', async (request, reply) => reply.header('cache-control', NO_STORE).send(ok(await getMyVideoRoom(deps, await actor(request), {}))));
  app.put('/api/v1/me/video-room', async (request, reply) => reply.header('cache-control', NO_STORE).send(ok(await saveVideoRoom(deps, await actor(request), bodyOf(request)))));
  app.delete('/api/v1/me/video-room', async (request) => ok(await removeVideoRoom(deps, await actor(request), {})));
}
