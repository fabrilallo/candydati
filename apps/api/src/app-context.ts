import { randomUUID } from 'node:crypto';
import {
  createDrizzleAuditLog,
  createDrizzleJobTemplates,
  createDrizzleJobs,
  createDrizzleOrganizationDirectory,
  createDrizzlePrivacyNotices,
  type AuditLogRepository,
  type CandidateDeps,
  type FileStorage,
  type JobDeps,
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
import { createPhase2Deps } from './wiring/phase2-deps.js';
import { createUserNameLookup, type UserNameLookup } from './http/user-names.js';
import type { Actor } from '@tt/core';

export interface RateLimitSettings {
  /** Requests per minute per client on every route. */
  readonly max: number;
  /** Requests per minute per client on /api/auth/*. */
  readonly authMax: number;
  /** Requests per minute per client on the public careers routes. */
  readonly publicMax?: number | undefined;
  /** Requests per minute per client on the ad quality analysis. */
  readonly qualityMax?: number | undefined;
  /** Public applications allowed per client in `applyWindowMinutes`. */
  readonly applyMax?: number | undefined;
  readonly applyWindowMinutes?: number | undefined;
}

export const DEFAULT_PUBLIC_MAX = 120;
export const DEFAULT_QUALITY_MAX = 20;
export const DEFAULT_APPLY_MAX = 5;
export const DEFAULT_APPLY_WINDOW_MINUTES = 10;
export const DEFAULT_RATE_LIMIT: RateLimitSettings = { max: 300, authMax: 20, publicMax: DEFAULT_PUBLIC_MAX, qualityMax: DEFAULT_QUALITY_MAX };

export interface AppContext {
  readonly env: Env;
  readonly auth: Auth;
  readonly auditLog: AuditLogRepository;
  readonly userNames: UserNameLookup;
  readonly resolveActor: (request: FastifyRequest) => Promise<Actor>;
  readonly checkDatabase: () => Promise<void>;
  readonly rateLimit: RateLimitSettings;
  readonly jobDeps: JobDeps;
  readonly candidateDeps: CandidateDeps;
  readonly privacyDeps: PrivacyDeps;
  readonly submitDeps: SubmitApplicationDeps;
}

export interface AppContextDeps {
  readonly env: Env;
  readonly db: Db;
  readonly emailSender: EmailSender;
  readonly rateLimit?: RateLimitSettings | undefined;
  readonly adQuality: AdQualityAnalyzer;
  readonly files: FileStorage;
  readonly queue: TaskQueue;
}

export function createAppContext({ env, db, emailSender, rateLimit, adQuality, files, queue }: AppContextDeps): AppContext {
  const auditLog = createDrizzleAuditLog(db);
  const auth = createAuth({ env, db, auditLog, emailSender });
  const resolveFromHeaders = createActorResolver({
    getSession: async (headers) => {
      const result = await auth.api.getSession({ headers });
      if (!result) return null;
      const activeOrganizationId: unknown = result.session.activeOrganizationId;
      return { userId: result.user.id, activeOrganizationId: typeof activeOrganizationId === 'string' ? activeOrganizationId : null };
    },
    findRole: (userId, organizationId) => findMemberRole(db, userId, organizationId),
  });
  return {
    env,
    auth,
    auditLog,
    userNames: createUserNameLookup(db),
    resolveActor: (request) => resolveFromHeaders(fromNodeHeaders(request.headers)),
    ...createPhase2Deps({ db, auditLog, files, queue }),
    checkDatabase: async () => void (await db.execute(sql`select 1`)),
    rateLimit: rateLimit ?? DEFAULT_RATE_LIMIT,
    jobDeps: {
      auditLog,
      jobs: createDrizzleJobs(db),
      jobTemplates: createDrizzleJobTemplates(db),
      organizations: createDrizzleOrganizationDirectory(db),
      privacyNotices: createDrizzlePrivacyNotices(db),
      adQuality,
      adQualityThreshold: env.platform.adQualityThreshold,
      newId: randomUUID,
      now: () => new Date(),
    },
  };
}
