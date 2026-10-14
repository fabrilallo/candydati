import type { FastifyRequest } from 'fastify';

const MASK = '***';

/**
 * Links whose only credential is a path segment: public feedback and consent links, Better Auth's password reset
 * (`/api/auth/reset-password/:token`, the emailed link) and the web page that accepts an invitation.
 */
const PATH_TOKEN = /(\/(?:public\/(?:feedback|consent)|api\/auth\/reset-password|accept-invitation)\/)[^/?#]+/g;
/**
 * Query parameters that carry a secret: Better Auth's `token` (email verification, account deletion, magic link),
 * OAuth `code` and `state`, the OAuth proxy `cookies`, and generic `secret` / `key` / `otp`.
 */
const QUERY_SECRET = /([?&](?:token|secret|key|code|state|otp|cookies)=)[^&#]*/gi;
/** The invitation id is what accepts an invitation (with the matching confirmed address): masked where it is read. */
const INVITATION_ID = /(\/organization\/get-invitation\?(?:[^#]*&)?id=)[^&#]*/gi;

/** The url as it may be written to a log: the secrets of emailed and public links replaced by `***`. */
export const maskSecretsInUrl = (url: string): string =>
  url.replace(PATH_TOKEN, `$1${MASK}`).replace(QUERY_SECRET, `$1${MASK}`).replace(INVITATION_ID, `$1${MASK}`);

/** Same fields as the Fastify default `req` serializer, with the url masked. Headers are never logged. */
export const requestLogSerializer = (request: FastifyRequest) => ({
  method: request.method,
  url: maskSecretsInUrl(request.url),
  host: request.host,
  remoteAddress: request.ip,
  ...(request.socket?.remotePort === undefined ? {} : { remotePort: request.socket.remotePort }),
});
