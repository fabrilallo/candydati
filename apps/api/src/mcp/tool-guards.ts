import { recordAuditEvent } from '@tt/core';
import type { ToolContext, ToolResult } from './tool-support.js';
import { toolError } from './tool-support.js';

export const MCP_MODEL_KEY_SCOPE = 'mcp_model:key';
export const MCP_MODEL_ORGANIZATION_SCOPE = 'mcp_model:organization';

/**
 * A model-backed tool (one that may call FAST_MODEL) spends one unit of the key's and of the organization's daily
 * budget. Without a model configured the tool runs on rules only and costs nothing. Null when allowed.
 */
export async function spendModelBudget({ app, actor }: ToolContext): Promise<ToolResult | null> {
  if (!app.env.FAST_MODEL) return null;
  const verdict = await app.budget.consume([
    { scope: MCP_MODEL_KEY_SCOPE, subject: actor.id ?? 'unknown', limit: app.env.MCP_MODEL_DAILY_BUDGET_PER_KEY },
    { scope: MCP_MODEL_ORGANIZATION_SCOPE, subject: actor.organizationId, limit: app.env.MCP_MODEL_DAILY_BUDGET_PER_ORGANIZATION },
  ]);
  if (verdict.allowed) return null;
  const whose = verdict.exhausted === MCP_MODEL_KEY_SCOPE ? 'this API key' : 'the organization';
  return toolError(`rate_limited: the daily budget of model-backed calls for ${whose} is used up. Try again tomorrow (UTC).`);
}

/** The ids a read was about: input fields named `id` or `...Id` with a string value. Nothing else of the input. */
export const idsOf = (input: unknown): Readonly<Record<string, string>> =>
  typeof input === 'object' && input !== null
    ? Object.fromEntries(Object.entries(input).filter(([key, value]) => (key === 'id' || key.endsWith('Id')) && typeof value === 'string'))
    : {};

/**
 * An MCP read is audited as `mcp.read` with the tool name and the ids it asked for, never the data it returned: a
 * key reading candidate data leaves a trace like a person opening a profile does.
 */
export async function auditRead({ app, actor }: ToolContext, tool: string, input: unknown): Promise<void> {
  await recordAuditEvent(app.core, actor, {
    organizationId: actor.organizationId,
    action: 'mcp.read',
    target: { type: 'api_key', id: actor.id ?? 'unknown' },
    metadata: { tool, ...idsOf(input) },
  });
}
