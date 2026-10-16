import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { safeErrorSerializer } from '@candydati/core';
import type { DistributionChannel, EmailIdentity, EmailSender as MessageSender, FileStorage, ImageTranscoder, TaskQueue } from '@candydati/core';
import { createEmailProvider, createErrorReporter, type ErrorReporter } from '@candydati/providers';
import type { Db } from '@candydati/db';
import type { AdQualityAnalyzer } from '@candydati/domain';
import { createConfiguredAnalyzer } from './ai/ad-quality.js';
import { registerAgentRoutes } from './agent/routes.js';
import { toEmailIdentity, toEmailSender } from '@candydati/providers';
import { createAppContext, DEFAULT_AUTH_EMAIL_MAX, type AppContext, type RateLimitSettings } from './app-context.js';
import { registerAuthRoutes } from './auth/fastify-auth.js';
import { createAccountMailer, type AccountMailer } from './auth/account-mailer.js';
import { createAuthEmails } from './auth/auth-emails.js';
import { createFailureNotifier } from './auth/failure-notice.js';
import { createPgThrottleStore } from './auth/pg-throttle-store.js';
import { createSignInThrottle, type ThrottleStore } from './auth/sign-in-throttle.js';
import type { BudgetStore } from './limits/daily-budget.js';
import type { Env } from './config/env.js';
import { registerErrorHandler } from './http/error-handler.js';
import { registerCsrfProtection } from './plugins/csrf.js';
import { registerNoStoreByDefault } from './plugins/cache-control.js';
import { requestLogSerializer } from './http/log-serializers.js';
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
import { createApiMetrics, type ApiMetrics } from './observability/api-metrics.js';
import { generateRequestId, registerRequestObservability } from './observability/request-hooks.js';
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
import { registerPublicViewRoute } from './routes/public-views.js';
import { registerApplicationRightsRoutes } from './routes/application-rights.js';
import { registerCandidateRightsRoutes } from './routes/candidate-rights.js';
import { registerExportRoutes } from './routes/exports.js';
import { registerPrivacyOverviewRoutes } from './routes/privacy-overview.js';
import { registerCareersPageRoutes } from './routes/careers-page.js';
import { registerPublicCareersRoutes } from './routes/public-careers.js';
import { registerImportRoutes } from './routes/imports.js';
import { registerMigrationRoutes } from './routes/migrations.js';
import { registerPublicConsentRoutes } from './routes/public-consent.js';
import { registerReportRoutes } from './routes/reports.js';
import { registerStatsRoutes } from './routes/stats.js';
import { registerFeedbackRoutes } from './routes/feedback.js';
import { registerPublicFeedbackRoutes } from './routes/public-feedback.js';
import { registerJobRequestRoutes } from './routes/job-requests.js';
import { registerJobTeamRoutes } from './routes/job-team.js';
import { registerStaleJobRoutes } from './routes/stale-jobs.js';
import { registerSecuritySettingsRoutes } from './routes/security-settings.js';

export interface ServerDeps {
  readonly env: Env;
  readonly db: Db;
  /** Account emails (verification, reset, invitations): through the messaging sender by default, a recorder in tests. */
  readonly accountMailer?: AccountMailer | undefined;
  readonly rateLimit?: RateLimitSettings | undefined;
  /** CV storage: S3 in production, in memory in tests. */
  readonly files: FileStorage;
  /** Background jobs: pg-boss in production, a recording queue in tests. */
  readonly queue: TaskQueue;
  /** Defaults to rules, or the model named by FAST_MODEL. */
  readonly adQuality?: AdQualityAnalyzer | undefined;
  /** Messages to candidates: the provider chosen by EMAIL_PROVIDER by default, a fake in tests. */
  readonly messaging?: { readonly sender: MessageSender; readonly identity: EmailIdentity } | undefined;
  /** Channels to distribute ads to besides the built-in feed. Empty by default (self-hosted); hosted deployments pass theirs. */
  readonly distributionChannels?: readonly DistributionChannel[] | undefined;
  /** Test seam: the "now" of the reports. */
  readonly reportClock?: (() => Date) | undefined;
  /** Test seam: the careers media transcoder (sharp by default). */
  readonly images?: ImageTranscoder | undefined;
  /** Failed sign-in counters. Postgres by default (shared by every api instance); in memory in tests. */
  readonly throttleStore?: ThrottleStore | undefined;
  /** Daily model budgets. Postgres by default. */
  readonly budgetStore?: BudgetStore | undefined;
  /** Readiness check of the queue (pg-boss). Absent where there is none (tests): readiness then skips it. */
  readonly checkQueue?: (() => Promise<void>) | undefined;
  /** Defaults to one built from SENTRY_DSN (off when unset). */
  readonly errorReporter?: ErrorReporter | undefined;
}


const loggerOptions = (env: Env) =>
  env.NODE_ENV === 'test'
    ? false
    : {
        level: env.LOG_LEVEL,
        redact: ['req.headers.cookie', 'req.headers.authorization'],
        // Public links carry their token in the path: it never reaches the logs.
        serializers: { req: requestLogSerializer, err: safeErrorSerializer },
        ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
      };

/** Fastify wants a list or a function: a hop count trusts the nearest N hops. */
const toFastifyTrustProxy = (value: Env['TRUST_PROXY']): string[] | ((address: string, hop: number) => boolean) =>
  typeof value === 'number' ? (_address, hop) => hop < value : [...value];

/** Builds the app from injected dependencies; nothing listens until the caller does. */
export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: loggerOptions(deps.env), trustProxy: toFastifyTrustProxy(deps.env.TRUST_PROXY), genReqId: generateRequestId });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  const metrics = createApiMetrics((error) => app.log.error({ err: error }, 'metrics collector failed'));
  const reporter = deps.errorReporter ?? createReporter(app, deps.env);
  const ctx = createContext(app, deps, metrics);

  registerRequestObservability(app, metrics);
  registerErrorHandler(app, reporter);
  registerNoStoreByDefault(app);
  await registerSecurity(app, deps.env, ctx.rateLimit);

  registerCsrfProtection(app, trustedOrigins(deps.env));
  registerHealthRoutes(app, ctx, { metrics, checkQueue: deps.checkQueue });
  registerOpenApiRoute(app, ctx);
  registerApiKeyRoutes(app, ctx);
  registerSecuritySettingsRoutes(app, ctx);
  registerMcpRoute(app, ctx);
  registerAccountRoutes(app, ctx, deps, metrics);
  registerRecruitingRoutes(app, ctx);
  await registerCandidateFacingRoutes(app, ctx);
  return app;
}

/** Off (nothing sent anywhere) unless SENTRY_DSN is set. The serializer keeps SQL and bound values out of the report. */
function createReporter(app: FastifyInstance, env: Env): ErrorReporter {
  return createErrorReporter({
    dsn: env.observability.sentryDsn,
    service: 'api',
    environment: env.observability.sentryEnvironment ?? env.NODE_ENV,
    release: env.observability.sentryRelease ?? undefined,
    describe: safeErrorSerializer,
    onProblem: (reason) => app.log.warn({ reason }, 'error reporting'),
  });
}

function createContext(app: FastifyInstance, deps: ServerDeps, metrics: ApiMetrics): AppContext {
  const provider = deps.messaging ? null : createEmailProvider(deps.env.email, (line) => app.log.info(line));
  const messaging = deps.messaging ?? { sender: toEmailSender(provider!), identity: toEmailIdentity(provider!) };
  return createAppContext({
    env: deps.env,
    db: deps.db,
    mailer:
      deps.accountMailer ??
      createAccountMailer({
        sender: messaging.sender,
        platformName: deps.env.platform.name,
        fromAddress: `${deps.env.email.fromLocal}@${deps.env.email.domain ?? 'localhost'}`,
        onError: (error, kind) => {
          metrics.emailFailures.inc({ kind: 'account' });
          app.log.error({ err: error, kind }, 'account email not sent');
        },
      }),
    budgetStore: deps.budgetStore,
    rateLimit: deps.rateLimit,
    files: deps.files,
    queue: deps.queue,
    ...messaging,
    distributionChannels: deps.distributionChannels,
    reportClock: deps.reportClock,
    images: deps.images,
    onReceiptError: (error) => {
      metrics.emailFailures.inc({ kind: 'receipt' });
      app.log.error({ err: error }, 'receipt email not queued');
    },
    adQuality: deps.adQuality ?? createConfiguredAnalyzer(deps.env.FAST_MODEL, app.log),
  });
}

function registerAccountRoutes(app: FastifyInstance, ctx: AppContext, deps: ServerDeps, metrics: ApiMetrics): void {
  registerAuthRoutes(app, ctx.auth, {
    authMax: ctx.rateLimit.authMax,
    readMax: ctx.rateLimit.max,
    emailMax: ctx.rateLimit.authEmailMax ?? DEFAULT_AUTH_EMAIL_MAX,
    throttle: createSignInThrottle(deps.throttleStore ?? createPgThrottleStore(deps.db)),
    onRepeatedFailures: createFailureNotifier(deps.db, createAuthEmails(ctx.mailer, deps.env.platform), (error) => {
      metrics.emailFailures.inc({ kind: 'signin_notice' });
      app.log.error({ err: error }, 'sign-in failure notice not sent');
    }),
  });
}

function registerRecruitingRoutes(app: FastifyInstance, ctx: AppContext): void {
  registerAuditLogRoutes(app, ctx);
  registerJobQualityRoute(app, ctx);
  registerJobRoutes(app, ctx);
  registerStaleJobRoutes(app, ctx);
  registerFeedbackRoutes(app, ctx);
  registerJobRequestRoutes(app, ctx);
  registerJobTeamRoutes(app, ctx);
  registerPublicFeedbackRoutes(app, ctx);
  registerJobTemplateRoutes(app, ctx);
  registerDistributionRoutes(app, ctx);
  registerPublicJobRoutes(app, ctx);
  registerPublicViewRoute(app, ctx);
  registerPrivacyNoticeRoutes(app, ctx);
  registerPipelineRoutes(app, ctx);
  registerAttentionRoutes(app, ctx);
  registerNotificationRoutes(app, ctx);
  registerTaskRoutes(app, ctx);
  registerAutomationRoutes(app, ctx);
  registerWebhookRoutes(app, ctx);
}

async function registerCandidateFacingRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  registerCandidateRoutes(app, ctx);
  registerApplicationCvRoute(app, ctx);
  registerCandidateRightsRoutes(app, ctx);
  registerApplicationRightsRoutes(app, ctx);
  registerPrivacyOverviewRoutes(app, ctx);
  registerExportRoutes(app, ctx);
  await registerPublicApplicationRoute(app, ctx);
  registerPublicConsentRoutes(app, ctx);
  await registerImportRoutes(app, ctx);
  await registerMigrationRoutes(app, ctx);
  await registerCareersPageRoutes(app, ctx);
  registerPublicCareersRoutes(app, ctx);
  registerStatsRoutes(app, ctx);
  registerReportRoutes(app, ctx);
  registerEmailSettingsRoutes(app, ctx);
  registerEmailTemplateRoutes(app, ctx);
  registerMessageRoutes(app, ctx);
  await registerInboundEmailRoutes(app, ctx);
  registerAgentRoutes(app, ctx);
}
