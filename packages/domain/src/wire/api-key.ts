import { z } from 'zod';
import { isPermission, type Permission } from '../access/permissions.js';
import { isoDate } from './common.js';

/** A key as the api lists it (`GET /api-keys`): never the hash, the secret only at creation. `createdByName` is null when the member left. */
export const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(z.custom<Permission>(isPermission, 'Unknown permission.')),
  createdBy: z.string(),
  createdByName: z.string().nullable(),
  createdAt: isoDate,
  lastUsedAt: isoDate.nullable(),
  expiresAt: isoDate.nullable(),
  revokedAt: isoDate.nullable(),
});
export type ApiKeyDto = z.output<typeof apiKeySchema>;

/** `POST /api-keys`: the only answer that carries the secret. */
export const apiKeyCreatedSchema = z.object({ key: apiKeySchema, secret: z.string().min(1) });
export type ApiKeyCreatedDto = z.output<typeof apiKeyCreatedSchema>;
