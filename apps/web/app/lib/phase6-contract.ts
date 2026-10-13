import { isPermission, jobContentSchema, type Permission } from '@tt/domain'
import { z } from 'zod'

/**
 * TEMPORARY mirror of the Phase 6 wire shapes (phase 6 contract: API keys, OpenAPI, MCP, internal agent). Permissions,
 * the forbidden list and the key input come from `@tt/domain`; the response shapes, paths and tool names are not
 * exported anywhere yet, so they live here, in this one file, until the api lands and a shared module exports them.
 * Where the contract leaves a field open, the schema accepts the plausible spellings and normalises them.
 */
const isoDate = z.iso.datetime({ offset: true })

// API keys ----------------------------------------------------------------------------------------------------------

export const API_KEYS_PATH = '/api/v1/api-keys'
export const apiKeyPath = (id: string): string => `${API_KEYS_PATH}/${encodeURIComponent(id)}`

/** Unknown scopes (a newer api) are dropped, never shown as raw strings. */
const scopesSchema = z.array(z.string()).transform((scopes) => scopes.filter((scope): scope is Permission => isPermission(scope)))

/** Who created the key: an object with a name, a bare name, or only an id. */
const creatorName = (raw: Record<string, unknown>): string | null => {
  const by = raw.createdBy
  if (typeof raw.createdByName === 'string') return raw.createdByName
  if (typeof by === 'object' && by !== null) {
    const record = by as { name?: unknown; email?: unknown }
    if (typeof record.name === 'string' && record.name.trim() !== '') return record.name
    if (typeof record.email === 'string') return record.email
  }
  return null
}

const apiKeyObject = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  scopes: scopesSchema,
  createdByName: z.string().nullable().default(null),
  createdAt: isoDate,
  lastUsedAt: isoDate.nullable().default(null),
  expiresAt: isoDate.nullable().default(null),
  revokedAt: isoDate.nullable().default(null),
})

export const apiKeySchema = z.preprocess(
  (raw) => (typeof raw === 'object' && raw !== null ? { ...raw, createdByName: creatorName(raw as Record<string, unknown>) } : raw),
  apiKeyObject,
)
export type ApiKeyDto = z.output<typeof apiKeyObject>

/** The only answer that carries the secret: `{ key, secret }` or the key's fields with `secret` beside them. */
export const apiKeyCreatedSchema = z.preprocess(
  (raw) => {
    if (typeof raw !== 'object' || raw === null) return raw
    const record = raw as { key?: unknown; apiKey?: unknown; secret?: unknown }
    const key = record.key ?? record.apiKey
    return typeof key === 'object' && key !== null ? { key, secret: record.secret } : { key: raw, secret: record.secret }
  },
  z.object({ key: apiKeySchema, secret: z.string().min(1) }),
)
export type ApiKeyCreatedDto = z.output<typeof apiKeyCreatedSchema>

// OpenAPI and MCP ---------------------------------------------------------------------------------------------------

export const OPENAPI_PATH = '/api/v1/openapi.json'
export const MCP_PATH = '/mcp'

/** The MCP tools of the contract, in the order the guide lists them (each one is labelled in the locale files). */
export const MCP_TOOLS = [
  'list_jobs',
  'get_job',
  'create_job',
  'update_job',
  'analyze_job_ad',
  'check_publishable',
  'publish_job',
  'get_pipeline',
  'list_attention',
  'add_candidate_note',
  'create_task',
  'list_job_templates',
  'get_job_stats',
  'get_reports',
] as const
export type McpTool = (typeof MCP_TOOLS)[number]

// Internal agent ----------------------------------------------------------------------------------------------------

export const AGENT_CHAT_PATH = '/api/v1/agent/chat'
/** `{ enabled }`: whether `AGENT_MODEL` is set. A 404 means an older api: the chat itself will say. */
export const AGENT_STATUS_PATH = '/api/v1/agent/status'
/** Error codes the api uses when no model is configured (`agent_disabled`, HTTP 503). */
export const AGENT_NOT_CONFIGURED_CODES: readonly string[] = ['agent_not_configured', 'agent_disabled']

export const agentStatusSchema = z.object({ enabled: z.boolean() })

/** The agent tools of the contract; anything else shows as a generic step. */
export const AGENT_TOOLS = [
  'get_job',
  'draft_job_content',
  'update_job_draft',
  'analyze_job_ad',
  'get_pipeline_summary',
  'list_attention',
  'get_candidate_brief',
  'draft_message',
  'create_task',
  'list_job_templates',
] as const
export type AgentTool = (typeof AGENT_TOOLS)[number]
export const isAgentTool = (name: string): name is AgentTool => (AGENT_TOOLS as readonly string[]).includes(name)

const personName = z.object({ firstName: z.string(), lastName: z.string() })

/** `draft_message`: a message for one application, returned to the person. The agent never sends it. */
export const draftMessageOutputSchema = z.preprocess(
  (raw) => {
    if (typeof raw !== 'object' || raw === null) return raw
    const record = raw as Record<string, unknown>
    const person = personName.safeParse(record.candidate).data
    const name = typeof record.candidateName === 'string' ? record.candidateName : person ? `${person.firstName} ${person.lastName}`.trim() : null
    return { ...record, candidateName: name }
  },
  z.object({
    applicationId: z.string().min(1),
    candidateName: z.string().nullable().default(null),
    subject: z.string(),
    body: z.string(),
    templateId: z.string().nullable().default(null),
  }),
)
export type DraftMessageOutput = z.output<typeof draftMessageOutputSchema>

/** `draft_job_content`: a proposal for the ad, as `{ proposal }` (the api), `{ content, jobId? }` or bare. Nothing is saved. */
const toDraftJob = (raw: unknown): unknown => {
  if (typeof raw !== 'object' || raw === null) return raw
  if ('proposal' in raw) return { content: (raw as { proposal: unknown }).proposal, jobId: (raw as { jobId?: unknown }).jobId ?? null }
  return 'content' in raw ? raw : { content: raw }
}
export const draftJobOutputSchema = z.preprocess(
  toDraftJob,
  z.object({ content: jobContentSchema, jobId: z.string().nullable().default(null) }),
)
export type DraftJobOutput = z.output<typeof draftJobOutputSchema>
