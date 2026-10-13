import { z } from 'zod';
import { jobContentSchema } from '../job/content.js';

/** Error code of the api when no model is configured (HTTP 503 on the chat). */
export const AGENT_DISABLED_CODE = 'agent_disabled';

/**
 * The tools of the internal agent, as registered in `apps/api/src/agent/tools`. The api should build its registry
 * from this list (or assert against it) so a new tool cannot be added without a label in the web.
 */
export const AGENT_TOOL_NAMES = [
  'get_job',
  'list_jobs',
  'list_job_templates',
  'analyze_job_ad',
  'draft_job_content',
  'update_job_draft',
  'get_pipeline_summary',
  'list_attention',
  'get_candidate_brief',
  'draft_message',
  'create_task',
  'get_reports_summary',
] as const;
export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];
export const isAgentToolName = (name: string): name is AgentToolName => (AGENT_TOOL_NAMES as readonly string[]).includes(name);

/** The tools of the MCP server (`apps/api/src/mcp`), in the order the guide lists them. Same note as above. */
export const MCP_TOOL_NAMES = [
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
] as const;
export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

/** `GET /agent/status`: `model` is `provider/model`, null when not configured. */
export const agentStatusSchema = z.object({ enabled: z.boolean(), model: z.string().nullable() });
export type AgentStatusDto = z.output<typeof agentStatusSchema>;

/** Output of the `draft_message` tool: a rendered draft for one application. The agent never sends it. */
export const draftMessageOutputSchema = z.object({
  status: z.literal('draft_not_sent'),
  applicationId: z.string().min(1),
  subject: z.string(),
  body: z.string(),
  unknownVariables: z.array(z.string()),
});
export type DraftMessageOutput = z.output<typeof draftMessageOutputSchema>;

/** Output of the `draft_job_content` tool: a proposal for the ad. Nothing is saved. */
export const draftJobOutputSchema = z.object({
  proposal: jobContentSchema,
  saved: z.literal(false),
  publishIssues: z.array(z.object({ path: z.string(), rule: z.string() })),
});
export type DraftJobOutput = z.output<typeof draftJobOutputSchema>;
