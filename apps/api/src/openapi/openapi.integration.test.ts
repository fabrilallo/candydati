import { MACHINE_FORBIDDEN_PERMISSIONS, isPermission } from '@tt/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../testing/test-app.js';
import { buildOpenApiDocument, operationIdOf } from './document.js';
import { COMPONENT_SCHEMAS, ROUTE_REGISTRY } from './registry.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON read back from the wire, asserted field by field
type Json = Record<string, any>;
const document = (): Json => buildOpenApiDocument({ title: 'Test API', version: '1' });

describe('route registry', () => {
  it.each(ROUTE_REGISTRY.map((route) => [`${route.method.toUpperCase()} ${route.path}`, route] as const))('%s exists in Fastify', (_label, route) => {
    expect(t.app.hasRoute({ method: route.method.toUpperCase() as 'GET', url: route.path })).toBe(true);
  });

  it('lists no route twice and gives every operation a distinct id', () => {
    const keys = ROUTE_REGISTRY.map((route) => `${route.method} ${route.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    const ids = ROUTE_REGISTRY.map(operationIdOf);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only asks for scopes a key can hold, and leaves out the routes a key can never use', () => {
    for (const route of ROUTE_REGISTRY) {
      if (route.scope === null || route.sessionOnly) continue;
      expect(isPermission(route.scope)).toBe(true);
      expect(MACHINE_FORBIDDEN_PERMISSIONS).not.toContain(route.scope);
    }
    const paths = ROUTE_REGISTRY.map((route) => route.path);
    expect(paths.some((path) => /api-keys|decide|move|messages|privacy|export(?!\.csv)|webhooks|notifications|erase/.test(path))).toBe(false);
  });
});

describe('OpenAPI document', () => {
  it('is OpenAPI 3.1 with a bearer scheme and one path item per registered route', () => {
    const doc = document();
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.components.securitySchemes.bearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' });
    for (const route of ROUTE_REGISTRY) {
      const operation = doc.paths[route.path.replace(/:(\w+)/g, '{$1}')]?.[route.method];
      expect(operation, `${route.method} ${route.path}`).toBeDefined();
      expect(operation.operationId).toBe(operationIdOf(route));
      expect(operation.responses[String(route.status ?? 200)]).toBeDefined();
      expect(operation.responses['404'] ?? operation.responses['429']).toBeDefined();
    }
  });

  it('resolves every $ref and documents every component', () => {
    const doc = document();
    const refs = [...JSON.stringify(doc).matchAll(/"\$ref":"#\/components\/(schemas|responses)\/(\w+)"/g)];
    expect(refs.length).toBeGreaterThan(0);
    for (const [, kind, name] of refs) expect(doc.components[kind!][name!], `${kind}/${name}`).toBeDefined();
    for (const name of Object.keys(COMPONENT_SCHEMAS)) expect(doc.components.schemas[name].type ?? doc.components.schemas[name].properties).toBeDefined();
  });

  it('declares path parameters, query parameters and request bodies from the schemas', () => {
    const doc = document();
    const publish = doc.paths['/api/v1/jobs/{id}/publish'].post;
    expect(publish.parameters).toEqual([{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }]);
    expect(publish['x-required-scope']).toBe('job:publish');
    const list = doc.paths['/api/v1/jobs'].get;
    expect(list.parameters.map((parameter: Json) => parameter.name)).toEqual(['status', 'page', 'limit']);
    const create = doc.paths['/api/v1/jobs'].post.requestBody.content['application/json'].schema;
    expect(Object.keys(create.properties)).toEqual(['content', 'templateId']);
    expect(create.properties.content.properties.title).toBeDefined();
    expect(create.properties.content.required ?? []).not.toContain('title');
    const task = doc.paths['/api/v1/tasks'].post.requestBody.content['application/json'].schema;
    expect(task.properties.dueAt).toMatchObject({ type: 'string', format: 'date-time' });
  });

  it('marks the public routes as not needing a key', () => {
    const doc = document();
    expect(doc.paths['/api/v1/public/organizations/{orgSlug}/jobs'].get.security).toEqual([]);
    expect(doc.paths['/api/v1/jobs'].get.security).toEqual([{ bearerAuth: [] }]);
  });

  it('documents the public read-only API under the Public tag, with the summary and the full feed', () => {
    const doc = document();
    const publicPaths = Object.keys(doc.paths).filter((path) => path.startsWith('/api/v1/public/organizations'));
    expect(publicPaths.toSorted()).toEqual([
      '/api/v1/public/organizations/{orgSlug}',
      '/api/v1/public/organizations/{orgSlug}/feed',
      '/api/v1/public/organizations/{orgSlug}/jobs',
      '/api/v1/public/organizations/{orgSlug}/jobs/{jobSlug}',
    ]);
    for (const path of publicPaths) expect(doc.paths[path].get).toMatchObject({ tags: ['Public'], security: [] });
    expect(doc.tags).toContainEqual({ name: 'Public' });
    expect(doc.components.schemas.PublicOrganizationSummary.properties).toHaveProperty('feedUrl');
    expect(doc.components.schemas.PublicFeed.properties.jobs.items.properties).toHaveProperty('updatedAt');
    expect(doc.components.schemas.PublicCareers.properties.jobs.items.properties).toHaveProperty('updatedAt');
    expect(doc.info.description).toContain('CORS');
  });

  it('is served publicly and cacheable at /api/v1/openapi.json', async () => {
    const response = await t.app.inject({ method: 'GET', url: '/api/v1/openapi.json' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toContain('s-maxage');
    const doc = response.json();
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.title).toContain('API');
    expect(Object.keys(doc.paths).length).toBeGreaterThan(10);
  });
});
