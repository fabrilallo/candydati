import { apiKeyInputSchema, grantablePermissions, parseApiKeySecret, type ApiKeyView } from '@tt/domain';
import { z } from 'zod';
import { toActorUserId } from '../../actor-user.js';
import { ConflictError, NotFoundError, ValidationError } from '../../errors.js';
import { toApiKeyView } from '../../mappers/api-key-dto.js';
import { defineApiKeyUseCase } from './define.js';

/** What the caller gets back when creating: the ONLY time the secret is ever returned. */
export interface CreatedApiKey {
  readonly key: ApiKeyView;
  readonly secret: string;
}

export const listApiKeys = defineApiKeyUseCase({
  name: 'listApiKeys',
  input: z.object({}),
  permission: 'api_key:manage',
  audit: { skip: 'read of organization settings' },
  handler: async ({ deps, actor }): Promise<readonly ApiKeyView[]> => (await deps.apiKeys.list(actor.organizationId)).map(toApiKeyView),
});

/**
 * Scopes must be grantable to a key for the creator's role: a key never has more than its creator, and never a
 * permission on the machine forbidden list. Show the secret once; only its hash is stored.
 */
export const createApiKey = defineApiKeyUseCase({
  name: 'createApiKey',
  input: apiKeyInputSchema,
  permission: 'api_key:manage',
  audit: {
    action: 'api_key.created',
    target: (_input, result: CreatedApiKey) => ({ type: 'api_key', id: result.key.id }),
    metadata: (_input, result: CreatedApiKey) => ({
      prefix: result.key.prefix,
      scopes: result.key.scopes,
      expiresAt: result.key.expiresAt?.toISOString() ?? null,
    }),
  },
  handler: async ({ deps, actor, input }): Promise<CreatedApiKey> => {
    const grantable = grantablePermissions(actor.role, 'api_key');
    const refused = input.scopes.filter((scope) => !grantable.includes(scope));
    if (refused.length > 0) {
      throw new ValidationError([{ path: 'scopes', message: `Not grantable to an API key: ${refused.join(', ')}.` }]);
    }
    const now = deps.now();
    if (input.expiresAt !== undefined && input.expiresAt.getTime() <= now.getTime()) {
      throw new ValidationError([{ path: 'expiresAt', message: 'The expiry must be in the future.' }]);
    }
    const secret = deps.newSecret();
    const parsed = parseApiKeySecret(secret);
    if (!parsed) throw new Error('newSecret returned a malformed API key secret');
    const key = await deps.apiKeys.create({
      id: deps.newId(),
      organizationId: actor.organizationId,
      name: input.name,
      prefix: parsed.prefix,
      hash: deps.hash(secret),
      scopes: input.scopes,
      createdBy: toActorUserId(actor),
      createdAt: now,
      lastUsedAt: null,
      expiresAt: input.expiresAt ?? null,
      revokedAt: null,
    });
    return { key: toApiKeyView(key), secret };
  },
});

export const revokeApiKey = defineApiKeyUseCase({
  name: 'revokeApiKey',
  input: z.object({ keyId: z.string().min(1) }),
  permission: 'api_key:manage',
  audit: {
    action: 'api_key.revoked',
    target: (_input, key: ApiKeyView) => ({ type: 'api_key', id: key.id }),
    metadata: (_input, key: ApiKeyView) => ({ prefix: key.prefix }),
  },
  handler: async ({ deps, actor, input }): Promise<ApiKeyView> => {
    const key = await deps.apiKeys.findById(actor.organizationId, input.keyId);
    if (!key) throw new NotFoundError('API key not found.');
    if (key.revokedAt !== null) throw new ConflictError('API key already revoked.');
    return toApiKeyView(await deps.apiKeys.save({ ...key, revokedAt: deps.now() }));
  },
});
