import { createHash, timingSafeEqual } from 'node:crypto';
import { grantablePermissions, parseApiKeySecret } from '@tt/domain';
import type { DelegatedActor } from '../../actor.js';
import type { ApiKeyAuthDeps } from '../../api-key-ports.js';

/** Update `lastUsedAt` at most once in this window. */
export const API_KEY_TOUCH_INTERVAL_MS = 60_000;

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();
/** Constant time, whatever the lengths: both sides are digested to 32 bytes first. */
const sameHash = (a: string, b: string): boolean => timingSafeEqual(digest(a), digest(b));

/**
 * Turns a presented secret into the actor it stands for, or null (a 401 for the caller, never a reason). The key is
 * dead when it is malformed, unknown, revoked, expired, its creator is no longer a member, or none of its scopes is
 * left. The creator's role is read now, not at creation: scopes the role no longer grants are dropped, and the
 * machine forbidden list is applied again, so a key never has more than its creator has today.
 */
export async function authenticateApiKey(deps: ApiKeyAuthDeps, secret: string): Promise<DelegatedActor | null> {
  const parsed = parseApiKeySecret(secret);
  if (!parsed) return null;
  const key = await deps.apiKeys.findByPrefix(parsed.prefix);
  if (!key || !sameHash(key.hash, deps.hash(secret))) return null;
  const now = deps.now();
  if (key.revokedAt !== null) return null;
  if (key.expiresAt !== null && key.expiresAt.getTime() <= now.getTime()) return null;
  const role = await deps.memberRoles.roleOf(key.organizationId, key.createdBy);
  if (role === null) return null;
  const grantable = grantablePermissions(role, 'api_key');
  const scopes = key.scopes.filter((scope) => grantable.includes(scope));
  if (scopes.length === 0) return null;
  if (key.lastUsedAt === null || now.getTime() - key.lastUsedAt.getTime() >= API_KEY_TOUCH_INTERVAL_MS) {
    await deps.apiKeys.touch(key.organizationId, key.id, now);
  }
  return { type: 'api_key', id: key.id, organizationId: key.organizationId, role, onBehalfOfUserId: key.createdBy, scopes };
}
