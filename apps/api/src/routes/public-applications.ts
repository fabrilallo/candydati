import multipart from '@fastify/multipart';
import { submitApplication } from '@tt/core';
import { ok } from '@tt/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { APPLICATION_BODY_LIMIT, MULTIPART_LIMITS, readApplicationParts } from '../http/application-multipart.js';
import { applyRouteConfig } from './limits.js';
import { paramOf } from './request.js';

/**
 * Public, no session. Multipart is registered in an encapsulated scope so it only exists on this route. The reply
 * is always `{ received: true }` on success and never says whether the email, the candidate or the job existed.
 */
export async function registerPublicApplicationRoute(app: FastifyInstance, ctx: AppContext): Promise<void> {
  await app.register(async (scope) => {
    await scope.register(multipart, { limits: MULTIPART_LIMITS });
    scope.post(
      '/api/v1/public/organizations/:orgSlug/jobs/:jobSlug/applications',
      { bodyLimit: APPLICATION_BODY_LIMIT, config: applyRouteConfig(ctx) },
      async (request, reply) => {
        const { form, cv } = await readApplicationParts(request);
        const receipt = await submitApplication(ctx.submitDeps, {
          organizationSlug: paramOf(request, 'orgSlug'),
          jobSlug: paramOf(request, 'jobSlug'),
          form,
          cv,
        });
        return reply.status(201).send(ok(receipt));
      },
    );
  });
}
