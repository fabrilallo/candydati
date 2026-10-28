import { randomUUID } from 'node:crypto';
import {
  createDrizzleUnitOfWork,
  type DrizzleUnitOfWork,
  type InstanceEmailDeps,
  type InstanceEmailTester,
  type SetupProgressDeps,
  type AiModelCheck,
  type InstanceAiDeps,
  type AuditLogRepository,
  type CoreDeps,
  type ReportDeps,
  type AutomationRuleDeps,
  type NotificationDeps,
  type TaskDeps,
  type WebhookDeps,
  type CandidateDeps,
  type TimelineDeps,
  type DistributionChannel,
  type DistributionDeps,
  type TrackedLinkDeps,
  type PublicSiteDeps,
  type EmailIdentity,
  type EmailSender as MessageSender,
  type FileStorage,
  type ImageTranscoder,
  type InboundDeps,
  type JobDeps,
  type MessagingDeps,
  type PrivacyDeps,
  type RecordJobViewDeps,
  type SubmitApplicationDeps,
  type TaskQueue,
  type BindableTaskQueue,
} from '@candydati/core';
import type { AdQualityAnalyzer } from '@candydati/domain';
import { createLiveSuggester } from './ai/responsibility-suggester.js';
import { sql, type Db } from '@candydati/db';
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
import { zipStreamFactory } from '@candydati/providers';
import { createUserNameLookup, type UserNameLookup } from './http/user-names.js';
import type { Actor, ApiKeyDeps, DelegatedActor, SecurityDeps, ResponsibilitySuggester } from '@candydati/core';
import { authenticateApiKey, withStorageErrors } from '@candydati/core';
import { createKeyRateLimiter } from './http/key-rate-limit.js';
import { createRequestActors } from './http/request-actors.js';
import { createApiKeyDeps } from './wiring/api-key-deps.js';
import { createDistributionDeps, createTrackedLinkDeps } from './wiring/distribution-deps.js';
import { createMigrationDeps, type MigrationRouteDeps } from './wiring/migration-deps.js';
import { createImportDeps, type ImportWiring } from './wiring/import-deps.js';
import { createCareersDeps, type CareersWiring } from './wiring/careers-deps.js';
import { createHrDeps, type HrWiring } from './wiring/hr-deps.js';
import { createTeamDeps, type TeamWiring } from './wiring/team-deps.js';
import { liveMessagingConfig, type AiRuntime, type EmailRuntime, type MigrationConnectorRegistry } from '@candydati/providers';
import { createInstanceAiDeps } from './wiring/instance-ai-deps.js';
import { createInstanceEmailDeps } from './wiring/instance-email-deps.js';
import { createSetupProgressDeps } from './wiring/setup-progress-deps.js';

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
  /** Visit beacons per minute per client on the public job pages. */
  readonly viewMax?: number | undefined;
  /** Import uploads per minute per client. */
  readonly importMax?: number | undefined;
  /** Requests per minute per client on the public reconfirmation routes. */
  readonly consentMax?: number | undefined;
  /** Requests per minute per client on the public interview feedback routes. */
  readonly feedbackMax?: number | undefined;
  /** Careers page media uploads per minute per client. */
  readonly careersMediaMax?: number | undefined;
  /** Requests per minute per client on the public careers media files (a page loads many). */
  readonly publicMediaMax?: number | undefined;
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
  /** Asks the object storage for `key`: "missing" proves it answers; anything else means it is unreachable. */
  readonly checkStorage: (key: string) => Promise<void>;
  /** Account emails, for the notices sent outside Better Auth (failed sign-ins). */
  readonly mailer: AccountMailer;
  /** Daily budgets of paid model calls (MCP tools, assistant). */
  readonly budget: DailyBudget;
  readonly rateLimit: RateLimitSettings;
  readonly jobDeps: JobDeps;
  /** The fast model that proposes responsibilities (off while none is configured). */
  readonly responsibilitySuggester: ResponsibilitySuggester;
  /** Read-only aggregates of the history kept by core. */
  readonly reportDeps: ReportDeps;
  readonly candidateDeps: CandidateDeps;
  /** The timeline of an application: the candidate repositories plus the submitted feedback. */
  readonly timelineDeps: TimelineDeps;
  readonly privacyDeps: PrivacyDeps;
  readonly submitDeps: SubmitApplicationDeps;
  readonly messagingDeps: MessagingDeps;
  readonly inboundDeps: InboundDeps;
  readonly notificationDeps: NotificationDeps;
  readonly taskDeps: TaskDeps;
  readonly automationDeps: AutomationRuleDeps;
  readonly webhookDeps: WebhookDeps;
  readonly distributionDeps: DistributionDeps;
  readonly trackedLinkDeps: TrackedLinkDeps;
  /** What the public reads need: published jobs, organizations, the privacy notice and the public base URL. */
  readonly publicSiteDeps: PublicSiteDeps;
  /** The visit beacon of the public job page. */
  readonly jobViewDeps: RecordJobViewDeps;
  readonly rightsDeps: Phase5Deps['rightsDeps'];
  readonly exportDeps: Phase5Deps['exportDeps'];
  readonly overviewDeps: Phase5Deps['overviewDeps'];
  readonly importDeps: ImportWiring['importDeps'];
  readonly consentDeps: ImportWiring['consentDeps'];
  readonly migrationDeps: MigrationRouteDeps;
  readonly careersDeps: CareersWiring['careersDeps'];
  readonly publicCareersDeps: CareersWiring['publicCareersDeps'];
  readonly feedbackDeps: HrWiring['feedbackDeps'];
  /** The public feedback form: a visitor with a link, no session. */
  readonly publicFeedbackDeps: HrWiring['publicFeedbackDeps'];
  readonly jobRequestDeps: HrWiring['jobRequestDeps'];
  readonly staleJobDeps: HrWiring['staleJobDeps'];
  readonly jobTeamDeps: TeamWiring['jobTeamDeps'];
  readonly accessSettingDeps: TeamWiring['accessSettingDeps'];
  /** How the instance sends email (settings saved from the app) and whether it can. */
  readonly instanceEmailDeps: InstanceEmailDeps;
  readonly setupProgressDeps: SetupProgressDeps;
  /** Which AI models the instance uses (environment or saved from the app), read at each use. */
  readonly aiRuntime: AiRuntime;
  readonly instanceAiDeps: InstanceAiDeps;
  readonly emailRuntime: EmailRuntime;
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
  /** Defaults to the fast model in force; tests pass a fake. */
  readonly responsibilitySuggester?: ResponsibilitySuggester | undefined;
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
  /** Migration source connectors: the built-in ones by default. */
  readonly migrationConnectors?: MigrationConnectorRegistry | undefined;
  /** "Now" of the reports (open and overdue promises, job age). The real clock unless a test fixes it. */
  readonly reportClock?: (() => Date) | undefined;
  /** Test seam: the careers media transcoder (sharp by default). */
  readonly images?: ImageTranscoder | undefined;
  /** The email settings in force (environment or app); gates publishing, applications and invitations until ready. */
  readonly emailRuntime: EmailRuntime;
  readonly emailLog?: ((line: string) => void) | undefined;
  readonly instanceEmailTester?: InstanceEmailTester | undefined;
  readonly aiRuntime: AiRuntime;
  /** Test seam: the test call of the AI settings (the provider by default). */
  readonly aiCheck?: AiModelCheck | undefined;
}

const isBindable = (queue: TaskQueue | BindableTaskQueue): queue is BindableTaskQueue => 'bindTo' in queue && typeof queue.bindTo === 'function';

export function createAppContext({ env, db, mailer, budgetStore, rateLimit, adQuality, responsibilitySuggester, files: rawFiles, queue, sender, identity, onReceiptError, onAfterCommitError, distributionChannels, migrationConnectors, reportClock, images, emailRuntime, emailLog, instanceEmailTester, aiRuntime, aiCheck }: AppContextDeps): AppContext {
  const files = withStorageErrors(rawFiles);
  // The one composition root: every repository on the pool, and the unit of work that rebinds them to a transaction.
  const uow = createDrizzleUnitOfWork(db, onAfterCommitError ?? onReceiptError, isBindable(queue) ? queue : undefined);
  const { auditLog } = uow.repositories;
  const core: CoreDeps = { auditLog, transaction: uow.transaction, jobTeams: uow.repositories.jobTeams };
  const auth = createAuth({ env, db, core, mailer, requiresTwoFactor: async (organizationId) => (await uow.repositories.securitySettings.get(organizationId)).requireTwoFactor, emailReady: () => emailRuntime.ready() });
  const emailConfig = liveMessagingConfig(env.platform, emailRuntime);
  const messaging = createMessagingDeps({ env, uow, queue, sender, identity, onReceiptError, config: emailConfig });
  const resolveFromHeaders = createSessionResolver(auth, db, uow);
  const apiKeyDeps = createApiKeyDeps(uow, env.API_KEY_DEFAULT_TTL_DAYS);
  const limits = rateLimit ?? DEFAULT_RATE_LIMIT;
  const actors = createActors({ env, limits, apiKeyDeps, resolveFromHeaders });
  const hr = createHrDeps({ uow, files, sender, config: emailConfig, onFeedbackMailError: onReceiptError });
  const phase2 = createPhase2Deps({ uow, files, queue, receipts: messaging.receipts, feedback: hr.stageEntry });
  const phase5 = createPhase5Deps({ uow, files, queue, candidateDeps: phase2.candidateDeps, providers: configuredProviders(env, aiRuntime), zip: zipStreamFactory, feedbackRecords: hr.feedbackRecords });
  const jobDeps = { ...createJobDeps(uow, adQuality, env.platform.adQualityThreshold), emailReady: () => emailRuntime.ready() };
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
    ...createMigrationDeps({ uow, files, queue, authSecret: env.BETTER_AUTH_SECRET, connectors: migrationConnectors }),
    ...instanceContext({ env, db, uow, files, queue, images, phase2, runtime: emailRuntime, log: emailLog, tester: instanceEmailTester, aiRuntime, aiCheck }),
    ...createPhase4Deps({ uow, queue, allowPrivateWebhooks: env.WEBHOOKS_ALLOW_PRIVATE }),
    timelineDeps: { ...phase2.candidateDeps, interviewFeedback: hr.feedbackRecords.interviewFeedback },
    ...hrContext(hr),
    ...createTeamDeps(uow),
    messagingDeps: messaging.messagingDeps,
    inboundDeps: messaging.inboundDeps,
    checkDatabase: async () => void (await db.execute(sql`select 1`)),
    checkStorage: storageProbe(rawFiles),
    securityDeps: { auditLog, transaction: uow.transaction, jobTeams: uow.repositories.jobTeams, securitySettings: uow.repositories.securitySettings, apiKeys: uow.repositories.apiKeys, memberRoles: uow.repositories.memberRoles, twoFactor: uow.repositories.twoFactor, now: () => new Date() },
    mailer,
    budget: createDailyBudget(budgetStore ?? createPgBudgetStore(db)),
    rateLimit: rateLimit ?? DEFAULT_RATE_LIMIT,
    jobDeps,
    responsibilitySuggester: responsibilitySuggester ?? createLiveSuggester(() => aiRuntime.snapshot().fast),
    reportDeps: { auditLog, transaction: uow.transaction, jobTeams: uow.repositories.jobTeams, jobs: jobDeps.jobs, reports: uow.repositories.reports, now: reportClock ?? (() => new Date()) },
    distributionDeps: createDistributionDeps({ uow, publicBaseUrl: env.platform.url, channels: distributionChannels }),
    trackedLinkDeps: createTrackedLinkDeps(uow),
    jobViewDeps: { jobs: jobDeps.jobs, organizations: jobDeps.organizations, jobViews: uow.repositories.jobViews, now: () => new Date() },
    publicSiteDeps: { jobs: jobDeps.jobs, organizations: jobDeps.organizations, privacyNotices: jobDeps.privacyNotices, publicBaseUrl: env.platform.url },
  };
}

interface EmailGatedInputs {
  readonly env: Env;
  readonly db: Db;
  readonly uow: DrizzleUnitOfWork;
  readonly files: FileStorage;
  readonly queue: TaskQueue | BindableTaskQueue;
  readonly images?: ImageTranscoder | undefined;
  readonly phase2: ReturnType<typeof createPhase2Deps>;
  readonly runtime: EmailRuntime;
  readonly log?: ((line: string) => void) | undefined;
  readonly tester?: InstanceEmailTester | undefined;
  readonly aiRuntime: AiRuntime;
  readonly aiCheck?: AiModelCheck | undefined;
}

/**
 * Instance-wide settings and what depends on them: what waits for the email (careers page publishing, public
 * applications), the email settings, and the AI settings.
 */
function instanceContext({ env, db, uow, files, queue, images, phase2, runtime, log, tester, aiRuntime, aiCheck }: EmailGatedInputs) {
  const emailReady = (): boolean => runtime.ready();
  const careers = createCareersDeps({ uow, files, queue, defaultLocale: env.platform.defaultLocale, images });
  return {
    ...careers,
    careersDeps: { ...careers.careersDeps, emailReady },
    submitDeps: { ...withDailyCaps(env, phase2), emailReady },
    instanceEmailDeps: createInstanceEmailDeps({ env, db, uow, runtime, log: log ?? (() => undefined), tester }),
    emailRuntime: runtime,
    setupProgressDeps: createSetupProgressDeps(uow),
    aiRuntime,
    instanceAiDeps: createInstanceAiDeps({ env, db, uow, runtime: aiRuntime, check: aiCheck }),
  };
}

/** The HR dependencies the routes read from the context, by name. */
const hrContext = (hr: ReturnType<typeof createHrDeps>) => ({
  feedbackDeps: hr.feedbackDeps,
  publicFeedbackDeps: hr.publicFeedbackDeps,
  jobRequestDeps: hr.jobRequestDeps,
  staleJobDeps: hr.staleJobDeps,
});

/** Asks the storage for a key: "missing" is the answer we want (the in-memory storage of the tests only names its error). */
const storageProbe =
  (files: FileStorage) =>
  async (key: string): Promise<void> => {
    try {
      await files.get(key);
    } catch (error) {
      if (!(error instanceof Error && error.name === 'FileNotFoundError')) throw error;
    }
  };

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
