import type { Permission } from '@tt/domain';
import type { FastifyInstance } from 'fastify';
import type { TestUser } from './client.js';

export interface CreatedKey {
  readonly id: string;
  readonly secret: string;
}

/** Creates a key as `user` (a session). Throws with the reply when the api refuses. */
export async function createKey(user: TestUser, scopes: readonly Permission[], extra: Record<string, unknown> = {}): Promise<CreatedKey> {
  const reply = await user.post<{ key: { id: string }; secret: string }>('/api/v1/api-keys', { name: 'Test key', scopes, ...extra });
  if (reply.status !== 201) throw new Error(`create key failed: ${reply.status} ${JSON.stringify(reply.body)}`);
  return { id: reply.body.data!.key.id, secret: reply.body.data!.secret };
}

export interface KeyReply<T = unknown> {
  readonly status: number;
  readonly body: { readonly success: boolean; readonly data: T | null; readonly error: { readonly code: string; readonly message: string } | null };
  readonly headers: Record<string, unknown>;
}

/** A request with a bearer secret and no cookie, like a server-to-server client. */
export async function withKey<T = unknown>(
  app: FastifyInstance,
  secret: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  options: { readonly body?: unknown; readonly headers?: Record<string, string> } = {},
): Promise<KeyReply<T>> {
  const response = await app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${secret}`, ...options.headers },
    ...(options.body === undefined ? {} : { payload: options.body as object }),
  });
  return { status: response.statusCode, body: response.json(), headers: response.headers };
}
