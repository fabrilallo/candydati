import type { FastifyRequest } from 'fastify';

const MASK = '***';

/** Public links carry their only credential in the path (`/public/feedback/:token`) or, rarely, in the query. */
const PATH_TOKEN = /(\/public\/(?:feedback|consent)\/)[^/?#]+/g;
const QUERY_SECRET = /([?&](?:token|secret|key|code)=)[^&#]*/gi;

/** The url as it may be written to a log: the secrets of public links replaced by `***`. */
export const maskSecretsInUrl = (url: string): string => url.replace(PATH_TOKEN, `$1${MASK}`).replace(QUERY_SECRET, `$1${MASK}`);

/** Same fields as the Fastify default `req` serializer, with the url masked. Headers are never logged. */
export const requestLogSerializer = (request: FastifyRequest) => ({
  method: request.method,
  url: maskSecretsInUrl(request.url),
  host: request.host,
  remoteAddress: request.ip,
  ...(request.socket?.remotePort === undefined ? {} : { remotePort: request.socket.remotePort }),
});
