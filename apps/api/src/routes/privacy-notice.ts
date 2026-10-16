import { getActivePrivacyNotice, listPrivacyNotices, privacyNoticeTemplate, publishPrivacyNotice, toPrivacyNoticeDto } from '@candydati/core';
import { ok } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app-context.js';
import { bodyOf, queryOf } from './request.js';

/** The notice candidates see before applying. Each save is a new immutable version. */
export function registerPrivacyNoticeRoutes(app: FastifyInstance, ctx: AppContext): void {
  const deps = ctx.privacyDeps;

  app.get('/api/v1/privacy-notice', async (request) => {
    const notice = await getActivePrivacyNotice(deps, await ctx.resolveActor(request), {});
    return ok(notice ? toPrivacyNoticeDto(notice) : null);
  });

  app.get('/api/v1/privacy-notice/versions', async (request) => {
    const notices = await listPrivacyNotices(deps, await ctx.resolveActor(request), {});
    return ok(notices.map(toPrivacyNoticeDto));
  });

  app.get('/api/v1/privacy-notice/template', async (request) =>
    ok(await privacyNoticeTemplate(deps, await ctx.resolveActor(request), queryOf(request))),
  );

  app.post('/api/v1/privacy-notice', async (request, reply) => {
    const notice = await publishPrivacyNotice(deps, await ctx.resolveActor(request), bodyOf(request));
    return reply.status(201).send(ok(toPrivacyNoticeDto(notice)));
  });
}
