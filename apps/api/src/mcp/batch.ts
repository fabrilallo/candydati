/** Largest JSON-RPC batch the MCP endpoint takes: beyond it the whole request is refused. */
export const MCP_MAX_BATCH = 20;

export type BatchVerdict =
  | { readonly ok: true; readonly cost: number }
  | { readonly ok: false; readonly status: number; readonly body: unknown };

const isToolCall = (message: unknown): boolean =>
  typeof message === 'object' && message !== null && (message as { method?: unknown }).method === 'tools/call';

/**
 * What a request costs against the key's rate limit: one unit per `tools/call` message (a batch of 20 calls is 20
 * requests), at least one. A batch larger than MCP_MAX_BATCH is refused before anything runs.
 */
export function mcpRequestCost(body: unknown): BatchVerdict {
  const messages = Array.isArray(body) ? body : [body];
  if (messages.length > MCP_MAX_BATCH) {
    return {
      ok: false,
      status: 400,
      body: { jsonrpc: '2.0', error: { code: -32600, message: `Batch too large: at most ${MCP_MAX_BATCH} messages per request.` }, id: null },
    };
  }
  return { ok: true, cost: Math.max(1, messages.filter(isToolCall).length) };
}
