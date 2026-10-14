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
  type BindableTaskQueue,
} from '@tt/core';
import type { AdQualityAnalyzer } from '@tt/domain';
import { sql, type Db } from '@tt/db';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyRequest } from 'fastify';
import { createAuth, type Auth } from './auth/create-auth.js';
import type { AccountMailer } from './auth/account-mailer.js';
import { createDailyBudget, createPgBudgetStore, type BudgetStore, type DailyBudget } from './limits/daily-budget.js';
import { findMemberRole } from './auth/member-role.js';
import type { Env } from './config/env.js';
import { createActorResolver } from './http/actor-resolver.js';
import { createMessagingDeps } from './wiring/messaging-deps.js';
import { createPhase2Deps } from './wiring/phase2-deps.js';
import { createPhase4Deps } from './wiring/phase4-deps.js';
import { configuredProviders } from './wiring/configured-providers.js';
import { createPhase5Deps, type Phase5Deps } from './wiring/phase5-deps.js';
import { zipStreamFactory } from '@tt/providers';
import { createUserNameLookup, type UserNameLookup } from './http/user-names.js';
import type { Actor, ApiKeyDeps, DelegatedActor, SecurityDeps } from '@tt/core';
import { authenticateApiKey, withStorageErrors } from '@tt/core';
import { createKeyRateLimiter } from './http/key-rate-limit.js';
import { createRequestActors } from './http/request-actors.js';
import { createApiKeyDeps } from './wiring/api-key-deps.js';
import { createDistributionDeps } from './wiring/distribution-deps.js';
import { createImportDeps, type ImportWiring } from './wiring/import-deps.js';
import { createHrDeps, type HrWiring } from './wiring/hr-deps.js';
import { createTeamDeps, type TeamWiring } from './wiring/team-deps.js';
import { toMessagingConfig } from '@tt/providers';

export interface RateLimitSettings {
  /** Requests per minute per client on every route. */
  readonly max: number;
  /** Requests per minute per client on /api/auth/*. */
  readonly authMax: number;
  /** Requests per minute per client on the auth routes that send an email (sign-up, password reset, verification). */
  readonly authEmailMax?: number | undefined;
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
export const DEFAULT_AUTH_EMAIL_MAX = 5;
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
  readonly resolveKeyActor: (request: FastifyRequest, cost?: number) => Promise<DelegatedActor>;
  readonly apiKeyDeps: ApiKeyDeps;
  /** Organization security settings (2FA requirement for owners and admins). */
  readonly securityDeps: SecurityDeps;
  readonly checkDatabase: () => Promise<void>;
  /** Account emails, for the notices sent outside Better Auth (failed sign-ins). */
  readonly mailer: AccountMailer;
  /** Daily budgets of paid model calls (MCP tools, assistant). */
  readonly budget: DailyBudget;
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
  readonly jobTeamDeps: TeamWiring['jobTeamDeps'];
  readonly accessSettingDeps: TeamWiring['accessSettingDeps'];
}

export interface AppContextDeps {
  readonly env: Env;
  readonly db: Db;
  /** Account emails (verification, password reset, invitations, failed sign-ins). */
  readonly mailer: AccountMailer;
  /** Daily model budgets: Postgres by default (shared by every instance), in memory in some tests. */
  readonly budgetStore?: BudgetStore | undefined;
  readonly rateLimit?: RateLimitSettings | undefined;
  readonly adQuality: AdQualityAnalyzer;
  readonly files: FileStorage;
  /** pg-boss in production (bindable: tasks are sent inside the transaction that queues them); a fake in tests. */
  readonly queue: TaskQueue | BindableTaskQueue;
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

const isBindable = (queue: TaskQueue | BindableTaskQueue): queue is BindableTaskQueue => 'bindTo' in queue && typeof queue.bindTo === 'function';

export function createAppContext({ env, db, mailer, budgetStore, rateLimit, adQuality, files: rawFiles, queue, sender, identity, onReceiptError, onAfterCommitError, distributionChannels, reportClock }: AppContextDeps): AppContext {
  const files = withStorageErrors(rawFiles);
  // The one composition root: every repository on the pool, and the unit of work that rebinds them to a transaction.
  const uow = createDrizzleUnitOfWork(db, onAfterCommitError ?? onReceiptError, isBindable(queue) ? queue : undefined);
  const { auditLog } = uow.repositories;
  const core: CoreDeps = { auditLog, transaction: uow.transaction, jobTeams: uow.repositories.jobTeams };
  const auth = createAuth({ env, db, core, mailer });
  const messaging = createMessagingDeps({ env, uow, queue, sender, identity, onReceiptError });
  const resolveFromHeaders = createSessionResolver(auth, db, uow);
  const apiKeyDeps = createApiKeyDeps(uow, env.API_KEY_DEFAULT_TTL_DAYS);
  const limits = rateLimit ?? DEFAULT_RATE_LIMIT;
  const actors = createActors({ env, limits, apiKeyDeps, resolveFromHeaders });
  const hr = createHrDeps({ uow, files, sender, config: toMessagingConfig(env.platform, env.email), onFeedbackMailError: onReceiptError });
  const phase2 = createPhase2Deps({ uow, files, queue, receipts: messaging.receipts, feedback: hr.stageEntry });
  const phase5 = createPhase5Deps({ uow, files, queue, candidateDeps: phase2.candidateDeps, providers: configuredProviders(env), zip: zipStreamFactory, feedbackRecords: hr.feedbackRecords });
  const jobDeps = createJobDeps(uow, adQuality, env.platform.adQualityThreshold);
  return {
    env,
    auth,
    auditLog,
    core,
    userNames: createUserNameLookup(uow.repositories.users),
    ...actors,
    apiKeyDeps,
    ...phase2,
    ...phase5,
    ...createImportDeps({ uow, files, queue }),
    ...createPhase4Deps({ uow, queue, allowPrivateWebhooks: env.WEBHOOKS_ALLOW_PRIVATE }),
    submitDeps: withDailyCaps(env, phase2),
    feedbackDeps: hr.feedbackDeps,
    publicFeedbackDeps: hr.publicFeedbackDeps,
    jobRequestDeps: hr.jobRequestDeps,
    staleJobDeps: hr.staleJobDeps,
    ...createTeamDeps(uow),
    messagingDeps: messaging.messagingDeps,
    inboundDeps: messaging.inboundDeps,
    checkDatabase: async () => void (await db.execute(sql`select 1`)),
    securityDeps: { auditLog, transaction: uow.transaction, jobTeams: uow.repositories.jobTeams, securitySettings: uow.repositories.securitySettings, now: () => new Date() },
    mailer,
    budget: createDailyBudget(budgetStore ?? createPgBudgetStore(db)),
    rateLimit: rateLimit ?? DEFAULT_RATE_LIMIT,
    jobDeps,
    reportDeps: { auditLog, transaction: uow.transaction, jobTeams: uow.repositories.jobTeams, jobs: jobDeps.jobs, reports: uow.repositories.reports, now: reportClock ?? (() => new Date()) },
    distributionDeps: createDistributionDeps({ uow, publicBaseUrl: env.platform.url, channels: distributionChannels }),
    publicSiteDeps: { jobs: jobDeps.jobs, organizations: jobDeps.organizations, privacyNotices: jobDeps.privacyNotices, publicBaseUrl: env.platform.url },
  };
}

function createSessionResolver(auth: ReturnType<typeof createAuth>, db: AppContextDeps['db'], uow: DrizzleUnitOfWork) {
  return createActorResolver({
    getSession: async (headers) => {
      const result = await auth.api.getSession({ headers });
      if (!result) return null;
      const activeOrganizationId: unknown = result.session.activeOrganizationId;
      const user = result.user as { id: string; emailVerified: boolean; twoFactorEnabled?: boolean | null };
      return {
        userId: user.id,
        activeOrganizationId: typeof activeOrganizationId === 'string' ? activeOrganizationId : null,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled === true,
      };
    },
    findRole: (userId, organizationId) => findMemberRole(db, userId, organizationId),
    requiresTwoFactor: async (organizationId) => (await uow.repositories.securitySettings.get(organizationId)).requireTwoFactor,
  });
}

function createActors({ env, limits, apiKeyDeps, resolveFromHeaders }: {
  env: AppContextDeps['env'];
  limits: RateLimitSettings;
  apiKeyDeps: ReturnType<typeof createApiKeyDeps>;
  resolveFromHeaders: ReturnType<typeof createSessionResolver>;
}) {
  return createRequestActors({
    session: async (request) => resolveFromHeaders(fromNodeHeaders(request.headers)),
    authenticate: (secret) => authenticateApiKey(apiKeyDeps, secret),
    limiter: createKeyRateLimiter({ max: limits.apiKeyMax ?? env.API_KEY_RATE_LIMIT ?? DEFAULT_API_KEY_MAX, windowMs: 60_000 }),
  });
}

function withDailyCaps(env: AppContextDeps['env'], phase2: ReturnType<typeof createPhase2Deps>): AppContext['submitDeps'] {
  return {
    ...phase2.submitDeps,
    dailyCaps: {
      applications: phase2.candidateDeps.applications,
      perOrganization: env.APPLICATIONS_DAILY_MAX_PER_ORGANIZATION,
      perJob: env.APPLICATIONS_DAILY_MAX_PER_JOB,
    },
  };
}

function createJobDeps(uow: DrizzleUnitOfWork, adQuality: AdQualityAnalyzer, adQualityThreshold: number): JobDeps {
  const r = uow.repositories;
  return {
    auditLog: r.auditLog,
    transaction: uow.transaction,
    jobTeams: r.jobTeams,
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
