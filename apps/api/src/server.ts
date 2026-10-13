import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Db } from '@tt/db';
import { createAppContext, type RateLimitSettings } from './app-context.js';
import { registerAuthRoutes } from './auth/fastify-auth.js';
import { createLogEmailSender, type EmailSender } from './auth/email-sender.js';
import type { Env } from './config/env.js';
import { registerErrorHandler } from './http/error-handler.js';
import { registerSecurity } from './plugins/security.js';
import { registerAuditLogRoutes } from './routes/audit-log.js';
import { registerHealthRoutes } from './routes/health.js';

export interface ServerDeps {
  readonly env: Env;
  readonly db: Db;
  /** Defaults to the log implementation. */
  readonly emailSender?: EmailSender | undefined;
  readonly rateLimit?: RateLimitSettings | undefined;
}

const loggerOptions = (env: Env) =>
  env.NODE_ENV === 'test'
    ? false
    : {
        level: env.LOG_LEVEL,
        redact: ['req.headers.cookie', 'req.headers.authorization'],
        ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
      };

/** Builds the app from injected dependencies; nothing listens until the caller does. */
export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: loggerOptions(deps.env), trustProxy: true });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const ctx = createAppContext({
    env: deps.env,
    db: deps.db,
    emailSender: deps.emailSender ?? createLogEmailSender(app.log),
    rateLimit: deps.rateLimit,
  });

  registerErrorHandler(app);
  await registerSecurity(app, deps.env, ctx.rateLimit);

  registerHealthRoutes(app, ctx);
  registerAuthRoutes(app, ctx.auth, ctx.rateLimit.authMax);
  registerAuditLogRoutes(app, ctx);
  return app;
}
