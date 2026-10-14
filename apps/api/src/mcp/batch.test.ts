import { describe, expect, it } from 'vitest';
import { MCP_MAX_BATCH, mcpRequestCost } from './batch.js';

const call = (id: number) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'list_jobs', arguments: {} } });

describe('mcpRequestCost', () => {
  it('costs one per tool call of a batch, at least one', () => {
    expect(mcpRequestCost(call(1))).toEqual({ ok: true, cost: 1 });
    expect(mcpRequestCost({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).toEqual({ ok: true, cost: 1 });
    expect(mcpRequestCost([call(1), call(2), { jsonrpc: '2.0', id: 3, method: 'tools/list' }])).toEqual({ ok: true, cost: 2 });
  });

  it('refuses a batch larger than the cap', () => {
    const verdict = mcpRequestCost(Array.from({ length: MCP_MAX_BATCH + 1 }, (_, i) => call(i)));
    expect(verdict).toMatchObject({ ok: false, status: 400 });
    expect(mcpRequestCost(Array.from({ length: MCP_MAX_BATCH }, (_, i) => call(i)))).toEqual({ ok: true, cost: MCP_MAX_BATCH });
  });
});
