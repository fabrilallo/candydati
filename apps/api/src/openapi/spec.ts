import type { Permission } from '@tt/domain';
import { z } from 'zod';
import type { ComponentName } from './components.js';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface RouteSpec {
  readonly method: HttpMethod;
  /** Fastify spelling (`:id`): the coverage test checks it against the real router. */
  readonly path: string;
  readonly tag: string;
  readonly summary: string;
  readonly description?: string;
  /** Scope the key needs. Null for public routes, and for the routes that need no particular permission (see `authenticated`, `sessionOnly`). */
  readonly scope: Permission | null;
  /** No scope, but a signed-in actor is required (a session or any key). */
  readonly authenticated?: boolean;
  readonly query?: z.ZodObject;
  readonly body?: z.ZodType;
  /** The body is `multipart/form-data` instead of JSON. */
  readonly multipart?: boolean;
  /** Session only: an API key is refused. `scope` then names the permission (null: the person's own data), not an API key scope. */
  readonly sessionOnly?: boolean;
  readonly status?: number;
  /** The success body is this media type (a file), not the JSON envelope. */
  readonly fileMediaType?: string;
  readonly response: {
    readonly schema: ComponentName | z.ZodType;
    readonly list?: boolean;
    readonly paginated?: boolean;
  };
}

/** Shared pieces of the route specs. */
export const page = { page: z.number().int().min(1).optional(), limit: z.number().int().min(1).max(100).optional() };
export const idResult = z.object({ id: z.string() });
