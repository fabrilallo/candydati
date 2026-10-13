import { describe, expect, it } from 'vitest';
import { automationRuleSchema } from './automation.js';

const base = { id: 'r1', jobId: 'j1', stageId: 's1', enabled: true, createdBy: 'u1', createdAt: '2026-05-01T10:00:00.000Z' };

describe('automationRuleSchema', () => {
  it('reads both actions, filling the default assignee', () => {
    expect(automationRuleSchema.parse({ ...base, action: { type: 'send_template', templateId: 'e1' } }).action).toEqual({ type: 'send_template', templateId: 'e1' });
    const task = automationRuleSchema.parse({ ...base, action: { type: 'create_task', title: 'Call' } });
    expect(task.action).toEqual({ type: 'create_task', title: 'Call', assignee: 'job_owner' });
  });

  it('refuses an action that could move or decide, and an object as creator', () => {
    expect(automationRuleSchema.safeParse({ ...base, action: { type: 'move', stageId: 's2' } }).success).toBe(false);
    expect(automationRuleSchema.safeParse({ ...base, createdBy: { id: 'u1', name: null }, action: { type: 'send_template', templateId: 'e1' } }).success).toBe(false);
  });
});
