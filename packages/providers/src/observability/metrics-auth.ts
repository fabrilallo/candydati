import { createHash, timingSafeEqual } from 'node:crypto';

/** Both sides are hashed first: equal-length buffers for `timingSafeEqual`, so not even the token's length leaks. */
const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

/** True when the `Authorization` header is `Bearer <token>` with exactly the configured token (constant time). */
export function isMetricsAuthorized(authorization: string | undefined, token: string | null): boolean {
  if (token === null || token === '' || authorization === undefined) return false;
  const match = /^Bearer (.+)$/i.exec(authorization.trim());
  if (!match?.[1]) return false;
  return timingSafeEqual(digest(match[1]), digest(token));
}
