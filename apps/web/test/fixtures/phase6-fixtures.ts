/** Wire shapes of the Phase 6 contract (API keys, OpenAPI, agent), as the api is expected to send them. */
export const apiKey = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: 'Integrazione CI',
  prefix: 'Ab12Cd34',
  scopes: ['job:read', 'job:create'],
  createdBy: 'u1',
  createdByName: 'Ada Lovelace',
  createdAt: '2026-10-01T09:00:00.000Z',
  lastUsedAt: '2026-10-12T15:30:00.000Z',
  expiresAt: null,
  revokedAt: null,
  ...overrides,
})

export const openApiSpec = {
  openapi: '3.1.0',
  info: { title: 'API', version: '1.0.0' },
  tags: [
    { name: 'jobs', description: 'Annunci' },
    { name: 'pipeline', description: 'Pipeline' },
  ],
  paths: {
    '/api/v1/jobs': {
      get: {
        tags: ['jobs'],
        summary: 'List jobs',
        operationId: 'listJobs',
        parameters: [{ name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['draft', 'published', 'closed'] } }],
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/JobList' } } } } },
      },
      post: {
        tags: ['jobs'],
        summary: 'Create a draft job',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/JobContent' } } } },
        responses: { '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } } } },
      },
    },
    '/api/v1/jobs/{id}/pipeline': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: { tags: ['pipeline'], summary: 'Pipeline of a job', responses: { '200': { description: 'OK' } } },
    },
    '/api/v1/careers/{org}': {
      get: { summary: 'Public careers page', security: [], responses: { '200': { description: 'OK' } } },
    },
  },
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
    schemas: {
      JobContent: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', maxLength: 120, description: 'Titolo' },
          salary: { type: 'object', properties: { min: { type: 'integer' }, max: { type: 'integer' } } },
          responsibilities: { type: 'array', items: { type: 'string' } },
        },
      },
      Job: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, content: { $ref: '#/components/schemas/JobContent' } } },
      JobList: { type: 'array', items: { $ref: '#/components/schemas/Job' } },
    },
  },
}
