import multipart from '@fastify/multipart';
import { submitApplication, ValidationError } from '@candydati/core';
import { ok, sanitizeOrigin } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { verifyTurnstile } from '../http/turnstile.js';
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
        const { form: rawForm, cv } = await readApplicationParts(request);
        // `origin` and `campaign` ride in the JSON of the form but are not form fields: it is sanitized to a short label and never refuses anything.
        const { origin, campaign, turnstileToken, ...form } = rawForm;
        const secret = ctx.env.TURNSTILE_SECRET_KEY;
        if (secret && !(await verifyTurnstile({ secret, token: typeof turnstileToken === 'string' ? turnstileToken : '', ip: request.ip }))) {
          throw new ValidationError([{ path: 'turnstile', message: 'captcha_failed' }]);
        }
        const receipt = await submitApplication(ctx.submitDeps, {
          organizationSlug: paramOf(request, 'orgSlug'),
          jobSlug: paramOf(request, 'jobSlug'),
          form,
          cv,
          origin: sanitizeOrigin(origin),
          campaign: typeof campaign === 'string' ? campaign : undefined,
        });
        return reply.status(201).send(ok(receipt));
      },
    );
  });
}
