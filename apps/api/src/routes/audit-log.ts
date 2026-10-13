import { listAuditLog } from '@tt/core';
import { ok } from '@tt/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { toAuditEventDto, userActorIds } from '../http/audit-dto.js';

/** Thin adapter: resolve the actor, call the use case (which validates, authorizes), shape the page. */
export function registerAuditLogRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/v1/audit-log', async (request) => {
    const actor = await ctx.resolveActor(request);
    const { items, meta } = await listAuditLog({ auditLog: ctx.auditLog }, actor, request.query);
    const names = await ctx.userNames(userActorIds(items));
    return ok(
      items.map((event) => toAuditEventDto(event, names)),
      meta,
    );
  });
}
