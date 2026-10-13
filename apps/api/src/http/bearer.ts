import type { IncomingHttpHeaders } from 'node:http';

const BEARER = /^Bearer[ \t]+(\S+)[ \t]*$/i;

/** The token of an `Authorization: Bearer <token>` header, or null when the request carries no bearer at all. */
export function bearerOf(headers: IncomingHttpHeaders): string | null {
  const header = headers.authorization;
  if (typeof header !== 'string') return null;
  const match = BEARER.exec(header);
  if (match?.[1] !== undefined) return match[1];
  // `Bearer` with nothing usable after it is still a bearer attempt: it must fail, never fall back to a cookie.
  return /^Bearer\b/i.test(header) ? '' : null;
}

export const hasBearer = (headers: IncomingHttpHeaders): boolean => bearerOf(headers) !== null;
