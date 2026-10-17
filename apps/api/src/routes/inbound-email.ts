import {
  EmailSendError,
  fetchResendReceivedContent,
  InboundParseError,
  parseRawMime,
  parseResendInbound,
  verifyHmacSignature,
  verifyResendSignature,
} from '@candydati/providers';
import { fail } from '@candydati/domain';
import { receiveInboundEmail, type InboundEmail } from '@candydati/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app-context.js';
import { INBOUND_BODY_LIMIT, resendApiKey, toCoreInbound } from '../http/inbound-email.js';
import { inboundRouteConfig } from './limits.js';

const resendEvent = z.object({ type: z.string(), data: z.object({ email_id: z.string().min(1) }).loose() }).loose();

const rawBody = (request: FastifyRequest): Buffer => (Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0));

type Store = (email: InboundEmail) => Promise<void>;

interface InboundHandlerDeps {
  readonly ctx: AppContext;
  readonly log: FastifyInstance['log'];
  readonly secret: string | undefined;
  readonly store: Store;
}

const handleRaw = ({ log, secret, store }: InboundHandlerDeps) => async (request: FastifyRequest, reply: FastifyReply) => {
  const body = rawBody(request);
  const header = request.headers['x-candydati-signature'];
  const timestamp = request.headers['x-candydati-timestamp'];
  const signed = verifyHmacSignature(body, typeof header === 'string' ? header : undefined, secret ?? '', typeof timestamp === 'string' ? timestamp : undefined);
  if (!secret || !signed) {
    return reply.status(401).send(fail('unauthorized', 'Invalid signature.'));
  }
  try {
    await store(toCoreInbound(await parseRawMime(body)));
  } catch (error) {
    if (!(error instanceof InboundParseError)) throw error;
    log.warn({ reason: error.message }, 'inbound email dropped');
  }
  return reply.status(202).send({ received: true });
};

const handleResend = ({ ctx, log, secret, store }: InboundHandlerDeps) => async (request: FastifyRequest, reply: FastifyReply) => {
  const body = rawBody(request);
  if (!secret || !verifyResendSignature(body, request.headers, secret)) {
    return reply.status(401).send(fail('unauthorized', 'Invalid signature.'));
  }
  try {
    const payload: unknown = JSON.parse(body.toString('utf8'));
    const event = resendEvent.safeParse(payload);
    if (!event.success || event.data.type !== 'email.received') {
      log.info('inbound webhook event ignored');
      return reply.status(202).send({ received: true });
    }
    const apiKey = resendApiKey(ctx.emailRuntime.snapshot());
    const received = apiKey ? await fetchResendReceivedContent(event.data.data.email_id, { apiKey }) : undefined;
    await store(toCoreInbound(parseResendInbound(payload, received)));
  } catch (error) {
    if (error instanceof EmailSendError && error.transient) {
      log.warn('inbound content not available yet, asking the provider to retry');
      return reply.status(503).send(fail('unavailable', 'Try again later.'));
    }
    if (!(error instanceof InboundParseError || error instanceof EmailSendError || error instanceof SyntaxError)) throw error;
    log.warn({ reason: error.message }, 'inbound email dropped');
  }
  return reply.status(202).send({ received: true });
};

/**
 * Provider webhooks: server-to-server, no session, signature required (401 otherwise). A well-signed request always
 * gets 202, even when the email is dropped, so a provider never learns which tokens exist. Only counts and reasons are
 * logged, never addresses or bodies. The signature covers the raw bytes, so these routes live in their own scope with
 * a parser that hands the body over unparsed.
 */
export async function registerInboundEmailRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const log = app.log;
  const store: Store = async (email) => {
    const result = await receiveInboundEmail(ctx.inboundDeps, email);
    log.info({ stored: result.stored, reason: result.reason }, 'inbound email processed');
  };
  const handlerDeps: InboundHandlerDeps = { ctx, log, secret: ctx.env.email.webhookSecret, store };

  await app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: INBOUND_BODY_LIMIT }, (_request, body, done) => done(null, body));
    const options = { bodyLimit: INBOUND_BODY_LIMIT, config: inboundRouteConfig(ctx) };
    scope.post('/api/v1/inbound/email/raw', options, handleRaw(handlerDeps));
    scope.post('/api/v1/inbound/email/resend', options, handleResend(handlerDeps));
  });
}
