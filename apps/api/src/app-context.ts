import { createDrizzleAuditLog, type AuditLogRepository } from '@tt/core';
import { sql, type Db } from '@tt/db';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyRequest } from 'fastify';
import { createAuth, type Auth } from './auth/create-auth.js';
import type { EmailSender } from './auth/email-sender.js';
import { findMemberRole } from './auth/member-role.js';
import type { Env } from './config/env.js';
import { createActorResolver } from './http/actor-resolver.js';
import { createUserNameLookup, type UserNameLookup } from './http/user-names.js';
import type { Actor } from '@tt/core';

export interface RateLimitSettings {
  /** Requests per minute per client on every route. */
  readonly max: number;
  /** Requests per minute per client on /api/auth/*. */
  readonly authMax: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitSettings = { max: 300, authMax: 20 };

export interface AppContext {
  readonly env: Env;
  readonly auth: Auth;
  readonly auditLog: AuditLogRepository;
  readonly userNames: UserNameLookup;
  readonly resolveActor: (request: FastifyRequest) => Promise<Actor>;
  readonly checkDatabase: () => Promise<void>;
  readonly rateLimit: RateLimitSettings;
}

export interface AppContextDeps {
  readonly env: Env;
  readonly db: Db;
  readonly emailSender: EmailSender;
  readonly rateLimit?: RateLimitSettings | undefined;
}

export function createAppContext({ env, db, emailSender, rateLimit }: AppContextDeps): AppContext {
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
    checkDatabase: async () => void (await db.execute(sql`select 1`)),
    rateLimit: rateLimit ?? DEFAULT_RATE_LIMIT,
  };
}
