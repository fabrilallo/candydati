import { completeTask, createTask, listApplicationTasks, listTasks, reopenTask, toTaskDto } from '@tt/core';
import { ok } from '@tt/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { asBoolean, bodyOf, paramOf, queryOf } from './request.js';
import { toTaskResponse } from './task-view.js';

const withoutUndefined = (input: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));

/** Tasks ("attività"): mine, by application, create, complete and reopen. */
export function registerTaskRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.taskDeps;

  app.get('/api/v1/tasks', async (request) => {
    const query = queryOf(request);
    const views = await listTasks(deps, await ctx.resolveActor(request), withoutUndefined({ mine: asBoolean(query.mine), open: asBoolean(query.open) }));
    return ok(views.map(toTaskDto));
  });

  app.get('/api/v1/applications/:id/tasks', async (request) =>
    ok((await listApplicationTasks(deps, await ctx.resolveActor(request), { applicationId: paramOf(request, 'id') })).map(toTaskDto)),
  );

  app.post('/api/v1/tasks', async (request, reply) => {
    const actor = await ctx.resolveActor(request);
    const task = await createTask(deps, actor, bodyOf(request));
    return reply.status(201).send(ok(await toTaskResponse(deps, actor.organizationId, task)));
  });

  app.post('/api/v1/tasks/:id/complete', async (request) => {
    const actor = await ctx.resolveActor(request);
    return ok(await toTaskResponse(deps, actor.organizationId, await completeTask(deps, actor, { taskId: paramOf(request, 'id') })));
  });

  app.post('/api/v1/tasks/:id/reopen', async (request) => {
    const actor = await ctx.resolveActor(request);
    return ok(await toTaskResponse(deps, actor.organizationId, await reopenTask(deps, actor, { taskId: paramOf(request, 'id') })));
  });
}
