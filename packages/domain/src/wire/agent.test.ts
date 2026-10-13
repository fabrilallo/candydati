import { describe, expect, it } from 'vitest';
import { AGENT_TOOL_NAMES, agentStatusSchema, draftJobOutputSchema, draftMessageOutputSchema, isAgentToolName, MCP_TOOL_NAMES } from './agent.js';

describe('agent wire schemas', () => {
  it('lists the reports tool of the agent and of the MCP server, each once', () => {
    expect(isAgentToolName('get_reports_summary')).toBe(true);
    expect(isAgentToolName('mystery')).toBe(false);
    expect(MCP_TOOL_NAMES).toContain('get_reports');
    expect(new Set(AGENT_TOOL_NAMES).size).toBe(AGENT_TOOL_NAMES.length);
    expect(new Set(MCP_TOOL_NAMES).size).toBe(MCP_TOOL_NAMES.length);
  });

  it('reads the status', () => {
    expect(agentStatusSchema.parse({ enabled: false, model: null })).toEqual({ enabled: false, model: null });
    expect(agentStatusSchema.safeParse({ enabled: true }).success).toBe(false);
  });

  it('reads a draft message and refuses an error result', () => {
    const output = { status: 'draft_not_sent', applicationId: 'a1', subject: 'Grazie', body: 'Ciao', unknownVariables: [] };
    expect(draftMessageOutputSchema.parse(output)).toEqual(output);
    expect(draftMessageOutputSchema.safeParse({ error: { code: 'forbidden' } }).success).toBe(false);
  });

  it('reads a job proposal, filling the content defaults', () => {
    const parsed = draftJobOutputSchema.parse({ proposal: { title: 'Data engineer' }, saved: false, publishIssues: [{ path: 'summary', rule: 'required' }] });
    expect(parsed.proposal).toMatchObject({ title: 'Data engineer', process: [] });
    expect(draftJobOutputSchema.safeParse({ proposal: { title: '' }, saved: false, publishIssues: [] }).success).toBe(false);
  });
});
