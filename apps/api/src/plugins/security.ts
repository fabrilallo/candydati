import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import type { FastifyInstance } from 'fastify';
import type { Env } from '../config/env.js';
import type { RateLimitSettings } from '../app-context.js';

export const trustedOrigins = (env: Pick<Env, 'WEB_ORIGIN' | 'TRUSTED_ORIGINS'>): readonly string[] => [
  env.WEB_ORIGIN,
  ...env.TRUSTED_ORIGINS,
];

export async function registerSecurity(app: FastifyInstance, env: Env, limits: RateLimitSettings): Promise<void> {
  await app.register(sensible);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: [...trustedOrigins(env)],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86_400,
  });
  await app.register(rateLimit, {
    global: true,
    max: limits.max,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) =>
      Object.assign(new Error('Too many requests.'), { statusCode: 429, retryAfterMs: context.ttl }),
  });
}
