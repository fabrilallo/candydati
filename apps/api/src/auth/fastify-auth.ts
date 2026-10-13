import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Auth } from './create-auth.js';
import { runWithRequestHeaders } from './request-context.js';

export const AUTH_PREFIX = '/api/auth';

const toWebRequest = (request: FastifyRequest): Request => {
  const url = new URL(request.url, `${request.protocol}://${request.headers.host ?? 'localhost'}`);
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && request.body !== undefined;
  return new Request(url, {
    method: request.method,
    headers: fromNodeHeaders(request.headers),
    ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
  });
};

async function forward(response: Response, reply: FastifyReply): Promise<FastifyReply> {
  reply.status(response.status);
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'set-cookie') reply.header(key, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) reply.header('set-cookie', cookies);
  return reply.send(response.body ? await response.text() : null);
}

/** Mounts Better Auth under /api/auth/*. */
/** `authMax`: requests per minute per client; sign-in and sign-up get a much smaller budget than the rest of the api. */
export function registerAuthRoutes(app: FastifyInstance, auth: Auth, authMax: number): void {
  app.route({
    method: ['GET', 'POST'],
    url: `${AUTH_PREFIX}/*`,
    config: { rateLimit: { max: authMax, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const webRequest = toWebRequest(request);
      const response = await runWithRequestHeaders(webRequest.headers, () => auth.handler(webRequest));
      return forward(response, reply);
    },
  });
}

export const sessionFromRequest = (auth: Auth, request: FastifyRequest) =>
  auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
