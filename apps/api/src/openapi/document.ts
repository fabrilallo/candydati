import { z } from 'zod';
import { COMPONENT_SCHEMAS, ROUTE_REGISTRY, type ComponentName, type RouteSpec } from './registry.js';

type Json = Record<string, unknown>;

const REF = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });
const ERROR_RESPONSES = { 401: 'Unauthenticated', 403: 'Forbidden', 404: 'NotFound', 422: 'ValidationFailed', 429: 'RateLimited' } as const;

/** JSON Schema 2020-12 (what OpenAPI 3.1 uses) of a Zod schema. Dates travel as ISO strings, anything Zod cannot draw stays open. */
function jsonSchema(schema: z.ZodType, io: 'input' | 'output'): Json {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema, {
    io,
    unrepresentable: 'any',
    override: (context) => {
      if (context.zodSchema._zod.def.type === 'date') Object.assign(context.jsonSchema, { type: 'string', format: 'date-time' });
    },
  }) as Json;
  return rest;
}

const dataSchema = ({ schema, list }: RouteSpec['response']): Json => {
  const item = typeof schema === 'string' ? REF(schema satisfies ComponentName) : jsonSchema(schema, 'output');
  return list ? { type: 'array', items: item } : item;
};

/** The single success envelope, parameterised by `data` (and `meta` for paginated lists). */
const envelope = (response: RouteSpec['response']): Json => ({
  type: 'object',
  required: ['success', 'data', 'error', ...(response.paginated ? ['meta'] : [])],
  properties: {
    success: { const: true },
    data: dataSchema(response),
    error: { type: 'null' },
    ...(response.paginated ? { meta: REF('PageMeta') } : {}),
  },
});

const pathParams = (path: string): readonly string[] => [...path.matchAll(/:(\w+)/g)].map((match) => match[1]!);

const queryParameters = (query: z.ZodObject): Json[] => {
  const schema = jsonSchema(query, 'input');
  const required = new Set((schema.required as string[] | undefined) ?? []);
  return Object.entries((schema.properties as Record<string, Json>) ?? {}).map(([name, value]) => ({
    name,
    in: 'query',
    required: required.has(name),
    schema: value,
  }));
};

const pascal = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/** `get /api/v1/jobs/:id/pipeline` -> `getJobsByIdPipeline`. */
export const operationIdOf = ({ method, path }: Pick<RouteSpec, 'method' | 'path'>): string =>
  method +
  path
    .replace(/^\/api\/v1\//, '')
    .split('/')
    .map((segment) => (segment.startsWith(':') ? `By${pascal(segment.slice(1))}` : segment.split('-').map(pascal).join('')))
    .join('');

const errorResponses = (isPublic: boolean): Json =>
  Object.fromEntries(
    Object.entries(ERROR_RESPONSES)
      .filter(([status]) => !(isPublic && (status === '401' || status === '403')))
      .map(([status, name]) => [status, { $ref: `#/components/responses/${name}` }]),
  );

function operation(route: RouteSpec): Json {
  const isPublic = route.scope === null && !route.sessionOnly && !route.authenticated;
  const parameters = [
    ...pathParams(route.path).map((name) => ({ name, in: 'path', required: true, schema: { type: 'string' } })),
    ...(route.query ? queryParameters(route.query) : []),
  ];
  const scopeNote = route.sessionOnly
    ? ` Session only: ${route.scope ? `requires the \`${route.scope}\` permission, and ` : ''}a request with an API key is refused with 403.`
    : route.scope
      ? ` Requires the \`${route.scope}\` scope.`
      : '';
  const bodyType = route.multipart ? 'multipart/form-data' : 'application/json';
  return {
    operationId: operationIdOf(route),
    tags: [route.tag],
    summary: route.summary,
    description: `${route.description ?? route.summary}${scopeNote}`,
    security: isPublic ? [] : route.sessionOnly ? [{ sessionCookie: [] }] : [{ bearerAuth: [] }],
    ...(route.scope && !route.sessionOnly ? { 'x-required-scope': route.scope } : {}),
    ...(route.sessionOnly ? { 'x-required-permission': route.scope } : {}),
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(route.body
      ? { requestBody: { required: true, content: { [bodyType]: { schema: jsonSchema(route.body, 'input') } } } }
      : {}),
    responses: {
      [String(route.status ?? 200)]: {
        description: 'Success',
        content: route.fileMediaType
          ? { [route.fileMediaType]: { schema: { type: 'string' } } }
          : { 'application/json': { schema: envelope(route.response) } },
      },
      ...errorResponses(isPublic),
    },
  };
}

const errorEnvelope: Json = {
  type: 'object',
  required: ['success', 'data', 'error'],
  properties: {
    success: { const: false },
    data: { type: 'null' },
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string', description: 'Stable and machine readable, e.g. `forbidden`, `validation_failed`.' },
        message: { type: 'string' },
        issues: { type: 'array', items: { type: 'object', required: ['path', 'message'], properties: { path: { type: 'string' }, message: { type: 'string' } } } },
      },
    },
  },
};

const errorResponse = (description: string): Json => ({ description, content: { 'application/json': { schema: REF('ErrorEnvelope') } } });

export interface OpenApiInfo {
  readonly title: string;
  readonly version: string;
}

/** OpenAPI 3.1 from the route registry: every route listed here is checked against the real router by a test. */
export function buildOpenApiDocument(info: OpenApiInfo, routes: readonly RouteSpec[] = ROUTE_REGISTRY): Json {
  const paths: Record<string, Json> = {};
  for (const route of routes) {
    const openapiPath = route.path.replace(/:(\w+)/g, '{$1}');
    paths[openapiPath] = { ...paths[openapiPath], [route.method]: operation(route) };
  }
  const schemas = Object.fromEntries(Object.entries(COMPONENT_SCHEMAS).map(([name, schema]) => [name, jsonSchema(schema, 'output')]));
  return {
    openapi: '3.1.0',
    info: {
      title: info.title,
      version: info.version,
      description:
        'The routes tagged `Public` need no authentication. The read-only ones under `/api/v1/public/organizations` are open to any origin (CORS `*`, GET only, no credentials); the consent, feedback and application routes are public too but not cross-origin: the link token (or the form) is the credential. The envelope has two exceptions that are not part of this document: the inbound email webhooks answer `{ received: true }`, and the Better Auth routes under `/api/auth` return their own error shape. Everything else: authenticate with `Authorization: Bearer <key>`. A key never has more than the person who created it, and can never decide on, message or erase candidates, nor manage keys, webhooks, privacy settings or exports: those routes are marked session only. Every other response uses the same envelope: `success`, `data`, `error`, and `meta` for pages.',
    },
    tags: [...new Set(routes.map((route) => route.tag))].map((name) => ({ name })),
    security: [{ bearerAuth: [] }],
    paths,
    components: {
      securitySchemes: {
        sessionCookie: { type: 'apiKey', in: 'cookie', name: 'better-auth.session_token', description: 'The browser session. Used by the routes that no API key may call (imports, decisions, messages, erasure, settings).' },
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'An API key (`tt_...`), created in the settings by an owner or admin.' },
      },
      schemas: {
        ...schemas,
        PageMeta: { type: 'object', required: ['total', 'page', 'limit'], properties: { total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' } } },
        ErrorEnvelope: errorEnvelope,
      },
      responses: {
        Unauthenticated: errorResponse('Missing, invalid, revoked or expired key.'),
        Forbidden: errorResponse('The key lacks the scope, or the action is never allowed to a key.'),
        NotFound: errorResponse('Not found, including ids of another organization.'),
        ValidationFailed: errorResponse('The input is invalid; `error.issues` says where.'),
        RateLimited: errorResponse('Too many requests.'),
      },
    },
  };
}
