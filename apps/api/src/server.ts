import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { DistributionChannel, EmailIdentity, EmailSender as MessageSender, FileStorage, TaskQueue } from '@tt/core';
import { createEmailProvider } from '@tt/providers';
import type { Db } from '@tt/db';
import type { AdQualityAnalyzer } from '@tt/domain';
import { createConfiguredAnalyzer } from './ai/ad-quality.js';
import { registerAgentRoutes } from './agent/routes.js';
import { toEmailIdentity, toEmailSender } from '@tt/providers';
import { createAppContext, type RateLimitSettings } from './app-context.js';
import { registerAuthRoutes } from './auth/fastify-auth.js';
import { createLogEmailSender, type EmailSender } from './auth/email-sender.js';
import type { Env } from './config/env.js';
import { registerErrorHandler } from './http/error-handler.js';
import { registerCsrfProtection } from './plugins/csrf.js';
import { registerSecurity, trustedOrigins } from './plugins/security.js';
import { registerApplicationCvRoute } from './routes/application-cv.js';
import { registerApiKeyRoutes } from './routes/api-keys.js';
import { registerMcpRoute } from './mcp/route.js';
import { registerOpenApiRoute } from './openapi/route.js';
import { registerDistributionRoutes } from './routes/distribution.js';
import { registerAttentionRoutes } from './routes/attention.js';
import { registerAutomationRoutes } from './routes/automations.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import { registerAuditLogRoutes } from './routes/audit-log.js';
import { registerEmailSettingsRoutes } from './routes/email-settings.js';
import { registerEmailTemplateRoutes } from './routes/email-templates.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerCandidateRoutes } from './routes/candidates.js';
import { registerInboundEmailRoutes } from './routes/inbound-email.js';
import { registerJobRoutes } from './routes/jobs.js';
import { registerJobQualityRoute } from './routes/job-quality.js';
import { registerJobTemplateRoutes } from './routes/job-templates.js';
import { registerMessageRoutes } from './routes/messages.js';
import { registerPipelineRoutes } from './routes/pipeline.js';
import { registerPrivacyNoticeRoutes } from './routes/privacy-notice.js';
import { registerPublicApplicationRoute } from './routes/public-applications.js';
import { registerPublicJobRoutes } from './routes/public-jobs.js';
import { registerApplicationRightsRoutes } from './routes/application-rights.js';
import { registerCandidateRightsRoutes } from './routes/candidate-rights.js';
import { registerExportRoutes } from './routes/exports.js';
import { registerPrivacyOverviewRoutes } from './routes/privacy-overview.js';
import { registerImportRoutes } from './routes/imports.js';
import { registerPublicConsentRoutes } from './routes/public-consent.js';
import { registerStatsRoutes } from './routes/stats.js';
import { registerFeedbackRoutes } from './routes/feedback.js';
import { registerPublicFeedbackRoutes } from './routes/public-feedback.js';
import { registerJobRequestRoutes } from './routes/job-requests.js';
import { registerStaleJobRoutes } from './routes/stale-jobs.js';

export interface ServerDeps {
  readonly env: Env;
  readonly db: Db;
  /** Defaults to the log implementation. */
  readonly emailSender?: EmailSender | undefined;
  readonly rateLimit?: RateLimitSettings | undefined;
  /** CV storage: S3 in production, in memory in tests. */
  readonly files: FileStorage;
  /** Background jobs: pg-boss in production, a recording queue in tests. */
  readonly queue: TaskQueue;
  /** Defaults to rules, or the model named by FAST_MODEL. */
  readonly adQuality?: AdQualityAnalyzer | undefined;
  /** Messages to candidates: the provider chosen by EMAIL_PROVIDER by default, a fake in tests. */
  readonly messaging?: { readonly sender: MessageSender; readonly identity: EmailIdentity } | undefined;
  /** Channels to distribute ads to besides the built-in feed. Empty by default (open source); hosted deployments pass theirs. */
  readonly distributionChannels?: readonly DistributionChannel[] | undefined;
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

  const provider = deps.messaging ? null : createEmailProvider(deps.env.email, (line) => app.log.info(line));
  const messaging = deps.messaging ?? { sender: toEmailSender(provider!), identity: toEmailIdentity(provider!) };
  const ctx = createAppContext({
    env: deps.env,
    db: deps.db,
    emailSender: deps.emailSender ?? createLogEmailSender(app.log),
    rateLimit: deps.rateLimit,
    files: deps.files,
    queue: deps.queue,
    ...messaging,
    distributionChannels: deps.distributionChannels,
    onReceiptError: (error) => app.log.error({ err: error }, 'receipt email not queued'),
    adQuality: deps.adQuality ?? createConfiguredAnalyzer(deps.env.FAST_MODEL, app.log),
  });

  registerErrorHandler(app);
  await registerSecurity(app, deps.env, ctx.rateLimit);

  registerCsrfProtection(app, trustedOrigins(deps.env));
  registerHealthRoutes(app, ctx);
  registerOpenApiRoute(app, ctx);
  registerApiKeyRoutes(app, ctx);
  registerMcpRoute(app, ctx);
  registerAuthRoutes(app, ctx.auth, ctx.rateLimit.authMax);
  registerAuditLogRoutes(app, ctx);
  registerJobQualityRoute(app, ctx);
  registerJobRoutes(app, ctx);
  registerStaleJobRoutes(app, ctx);
  registerFeedbackRoutes(app, ctx);
  registerJobRequestRoutes(app, ctx);
  registerPublicFeedbackRoutes(app, ctx);
  registerJobTemplateRoutes(app, ctx);
  registerDistributionRoutes(app, ctx);
  registerPublicJobRoutes(app, ctx);
  registerPrivacyNoticeRoutes(app, ctx);
  registerPipelineRoutes(app, ctx);
  registerAttentionRoutes(app, ctx);
  registerNotificationRoutes(app, ctx);
  registerTaskRoutes(app, ctx);
  registerAutomationRoutes(app, ctx);
  registerWebhookRoutes(app, ctx);
  registerCandidateRoutes(app, ctx);
  registerApplicationCvRoute(app, ctx);
  registerCandidateRightsRoutes(app, ctx);
  registerApplicationRightsRoutes(app, ctx);
  registerPrivacyOverviewRoutes(app, ctx);
  registerExportRoutes(app, ctx);
  await registerPublicApplicationRoute(app, ctx);
  registerPublicConsentRoutes(app, ctx);
  await registerImportRoutes(app, ctx);
  registerStatsRoutes(app, ctx);
  registerEmailSettingsRoutes(app, ctx);
  registerEmailTemplateRoutes(app, ctx);
  registerMessageRoutes(app, ctx);
  await registerInboundEmailRoutes(app, ctx);
  registerAgentRoutes(app, ctx);
  return app;
}
