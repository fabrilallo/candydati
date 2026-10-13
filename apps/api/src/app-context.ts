import { randomUUID } from 'node:crypto';
import {
  createDrizzleUnitOfWork,
  type DrizzleUnitOfWork,
  type AuditLogRepository,
  type CoreDeps,
  type ReportDeps,
  type AutomationRuleDeps,
  type NotificationDeps,
  type TaskDeps,
  type WebhookDeps,
  type CandidateDeps,
  type DistributionChannel,
  type DistributionDeps,
  type PublicSiteDeps,
  type EmailIdentity,
  type EmailSender as MessageSender,
  type FileStorage,
  type InboundDeps,
  type JobDeps,
  type MessagingDeps,
  type PrivacyDeps,
  type SubmitApplicationDeps,
  type TaskQueue,
} from '@tt/core';
import type { AdQualityAnalyzer } from '@tt/domain';
import { sql, type Db } from '@tt/db';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyRequest } from 'fastify';
import { createAuth, type Auth } from './auth/create-auth.js';
import type { EmailSender } from './auth/email-sender.js';
import { findMemberRole } from './auth/member-role.js';
import type { Env } from './config/env.js';
import { createActorResolver } from './http/actor-resolver.js';
import { createMessagingDeps } from './wiring/messaging-deps.js';
import { createPhase2Deps } from './wiring/phase2-deps.js';
import { createPhase4Deps } from './wiring/phase4-deps.js';
import { configuredProviders } from './wiring/configured-providers.js';
import { createPhase5Deps, type Phase5Deps } from './wiring/phase5-deps.js';
import { zipWriterFactory } from '@tt/providers';
import { createUserNameLookup, type UserNameLookup } from './http/user-names.js';
import type { Actor, ApiKeyDeps, DelegatedActor } from '@tt/core';
import { authenticateApiKey, withStorageErrors } from '@tt/core';
import { createKeyRateLimiter } from './http/key-rate-limit.js';
import { createRequestActors } from './http/request-actors.js';
import { createApiKeyDeps } from './wiring/api-key-deps.js';
import { createDistributionDeps } from './wiring/distribution-deps.js';
import { createImportDeps, type ImportWiring } from './wiring/import-deps.js';
import { createHrDeps, type HrWiring } from './wiring/hr-deps.js';
import { toMessagingConfig } from '@tt/providers';

export interface RateLimitSettings {
  /** Requests per minute per client on every route. */
  readonly max: number;
  /** Requests per minute per client on /api/auth/*. */
  readonly authMax: number;
  /** Requests per minute per client on the public careers routes. */
  readonly publicMax?: number | undefined;
  /** Requests per minute per client on the ad quality analysis. */
  readonly qualityMax?: number | undefined;
  /** Requests per minute per client on the inbound email webhooks. */
  readonly inboundMax?: number | undefined;
  /** Public applications allowed per client in `applyWindowMinutes`. */
  readonly applyMax?: number | undefined;
  readonly applyWindowMinutes?: number | undefined;
  /** Import uploads per minute per client. */
  readonly importMax?: number | undefined;
  /** Requests per minute per client on the public reconfirmation routes. */
  readonly consentMax?: number | undefined;
  /** Requests per minute per client on the public interview feedback routes. */
  readonly feedbackMax?: number | undefined;
  /** Requests per minute per API key (on top of the per-client limit). */
  readonly apiKeyMax?: number | undefined;
}

export const DEFAULT_PUBLIC_MAX = 120;
export const DEFAULT_QUALITY_MAX = 20;
export const DEFAULT_INBOUND_MAX = 120;
export const DEFAULT_API_KEY_MAX = 120;
export const DEFAULT_APPLY_MAX = 5;
export const DEFAULT_APPLY_WINDOW_MINUTES = 10;
export const DEFAULT_RATE_LIMIT: RateLimitSettings = { max: 300, authMax: 20, publicMax: DEFAULT_PUBLIC_MAX, qualityMax: DEFAULT_QUALITY_MAX };

export interface AppContext {
  readonly env: Env;
  readonly auth: Auth;
  readonly auditLog: AuditLogRepository;
  /** The audit log and the unit of work: what a use case with no other dependency needs. */
  readonly core: CoreDeps;
  readonly userNames: UserNameLookup;
  /** Bearer API key when present (cookies ignored), otherwise the session. */
  readonly resolveActor: (request: FastifyRequest) => Promise<Actor>;
  /** Session only: refuses any request that carries a bearer. */
  readonly resolveSessionActor: (request: FastifyRequest) => Promise<Actor>;
  /** Bearer API key only (MCP). */
  readonly resolveKeyActor: (request: FastifyRequest) => Promise<DelegatedActor>;
  readonly apiKeyDeps: ApiKeyDeps;
  readonly checkDatabase: () => Promise<void>;
  readonly rateLimit: RateLimitSettings;
  readonly jobDeps: JobDeps;
  /** Read-only aggregates of the history kept by core. */
  readonly reportDeps: ReportDeps;
  readonly candidateDeps: CandidateDeps;
  readonly privacyDeps: PrivacyDeps;
  readonly submitDeps: SubmitApplicationDeps;
  readonly messagingDeps: MessagingDeps;
  readonly inboundDeps: InboundDeps;
  readonly notificationDeps: NotificationDeps;
  readonly taskDeps: TaskDeps;
  readonly automationDeps: AutomationRuleDeps;
  readonly webhookDeps: WebhookDeps;
  readonly distributionDeps: DistributionDeps;
  /** What the public reads need: published jobs, organizations, the privacy notice and the public base URL. */
  readonly publicSiteDeps: PublicSiteDeps;
  readonly rightsDeps: Phase5Deps['rightsDeps'];
  readonly exportDeps: Phase5Deps['exportDeps'];
  readonly overviewDeps: Phase5Deps['overviewDeps'];
  readonly importDeps: ImportWiring['importDeps'];
  readonly consentDeps: ImportWiring['consentDeps'];
  readonly feedbackDeps: HrWiring['feedbackDeps'];
  /** The public feedback form: a visitor with a link, no session. */
  readonly publicFeedbackDeps: HrWiring['publicFeedbackDeps'];
  readonly jobRequestDeps: HrWiring['jobRequestDeps'];
  readonly staleJobDeps: HrWiring['staleJobDeps'];
}

export interface AppContextDeps {
  readonly env: Env;
  readonly db: Db;
  readonly emailSender: EmailSender;
  readonly rateLimit?: RateLimitSettings | undefined;
  readonly adQuality: AdQualityAnalyzer;
  readonly files: FileStorage;
  readonly queue: TaskQueue;
  readonly sender: MessageSender;
  readonly identity: EmailIdentity;
  readonly onReceiptError: (error: unknown) => void;
  /** A side effect that failed after its transaction committed (a task not queued). Defaults to `onReceiptError`. */
  readonly onAfterCommitError?: ((error: unknown) => void) | undefined;
  /** Distribution channels beyond the built-in feed: none by default, hosted deployments register theirs. */
  readonly distributionChannels?: readonly DistributionChannel[] | undefined;
  /** "Now" of the reports (open and overdue promises, job age). The real clock unless a test fixes it. */
  readonly reportClock?: (() => Date) | undefined;
}

export function createAppContext({ env, db, emailSender, rateLimit, adQuality, files: rawFiles, queue, sender, identity, onReceiptError, onAfterCommitError, distributionChannels, reportClock }: AppContextDeps): AppContext {
  const files = withStorageErrors(rawFiles);
  // The one composition root: every repository on the pool, and the unit of work that rebinds them to a transaction.
  const uow = createDrizzleUnitOfWork(db, onAfterCommitError ?? onReceiptError);
  const { auditLog } = uow.repositories;
  const core: CoreDeps = { auditLog, transaction: uow.transaction };
  const auth = createAuth({ env, db, core, emailSender });
  const messaging = createMessagingDeps({ env, uow, queue, sender, identity, onReceiptError });
  const resolveFromHeaders = createActorResolver({
    getSession: async (headers) => {
      const result = await auth.api.getSession({ headers });
      if (!result) return null;
      const activeOrganizationId: unknown = result.session.activeOrganizationId;
      return { userId: result.user.id, activeOrganizationId: typeof activeOrganizationId === 'string' ? activeOrganizationId : null };
    },
    findRole: (userId, organizationId) => findMemberRole(db, userId, organizationId),
  });
  const apiKeyDeps = createApiKeyDeps(uow);
  const limits = rateLimit ?? DEFAULT_RATE_LIMIT;
  const actors = createRequestActors({
    session: async (request) => resolveFromHeaders(fromNodeHeaders(request.headers)),
    authenticate: (secret) => authenticateApiKey(apiKeyDeps, secret),
    limiter: createKeyRateLimiter({ max: limits.apiKeyMax ?? env.API_KEY_RATE_LIMIT ?? DEFAULT_API_KEY_MAX, windowMs: 60_000 }),
  });
  const hr = createHrDeps({
    uow,
    files,
    sender,
    config: toMessagingConfig(env.platform, env.email),
    onFeedbackMailError: (error) => onReceiptError(error),
  });
  const phase2 = createPhase2Deps({ uow, files, queue, receipts: messaging.receipts, feedback: hr.stageEntry });
  const phase5 = createPhase5Deps({ uow, files, queue, candidateDeps: phase2.candidateDeps, providers: configuredProviders(env), zip: zipWriterFactory, feedbackRecords: hr.feedbackRecords });
  const jobDeps = createJobDeps(uow, adQuality, env.platform.adQualityThreshold);
  const distributionDeps = createDistributionDeps({ uow, publicBaseUrl: env.platform.url, channels: distributionChannels });
  return {
    env,
    auth,
    auditLog,
    core,
    userNames: createUserNameLookup(db),
    ...actors,
    apiKeyDeps,
    ...phase2,
    ...phase5,
    ...createImportDeps({ uow, files, queue }),
    ...createPhase4Deps({ uow, queue, allowPrivateWebhooks: env.WEBHOOKS_ALLOW_PRIVATE }),
    submitDeps: {
      ...phase2.submitDeps,
      dailyCaps: {
        applications: phase2.candidateDeps.applications,
        perOrganization: env.APPLICATIONS_DAILY_MAX_PER_ORGANIZATION,
        perJob: env.APPLICATIONS_DAILY_MAX_PER_JOB,
      },
    },
    feedbackDeps: hr.feedbackDeps,
    publicFeedbackDeps: hr.publicFeedbackDeps,
    jobRequestDeps: hr.jobRequestDeps,
    staleJobDeps: hr.staleJobDeps,
    messagingDeps: messaging.messagingDeps,
    inboundDeps: messaging.inboundDeps,
    checkDatabase: async () => void (await db.execute(sql`select 1`)),
    rateLimit: rateLimit ?? DEFAULT_RATE_LIMIT,
    jobDeps,
    reportDeps: { auditLog, transaction: uow.transaction, jobs: jobDeps.jobs, reports: uow.repositories.reports, now: reportClock ?? (() => new Date()) },
    distributionDeps,
    publicSiteDeps: { jobs: jobDeps.jobs, organizations: jobDeps.organizations, privacyNotices: jobDeps.privacyNotices, publicBaseUrl: env.platform.url },
  };
}

function createJobDeps(uow: DrizzleUnitOfWork, adQuality: AdQualityAnalyzer, adQualityThreshold: number): JobDeps {
  const r = uow.repositories;
  return {
    auditLog: r.auditLog,
    transaction: uow.transaction,
    jobs: r.jobs,
    jobTemplates: r.jobTemplates,
    applicationCounts: r.applicationCounts,
    organizations: r.organizations,
    privacyNotices: r.privacyNotices,
    automationRules: r.automationRules,
    outbox: r.outbox,
    approvals: r.approvals,
    organizationSettings: r.organizationSettings,
    adQuality,
    adQualityThreshold,
    newId: randomUUID,
    now: () => new Date(),
  };
}
