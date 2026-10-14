import { timingSafeEqual } from 'node:crypto';

/** True when the `Authorization` header is `Bearer <token>` with exactly the configured token (constant time). */
export function isMetricsAuthorized(authorization: string | undefined, token: string | null): boolean {
  if (token === null || authorization === undefined) return false;
  const match = /^Bearer (.+)$/i.exec(authorization.trim());
  if (!match?.[1]) return false;
  const given = Buffer.from(match[1]);
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
