import { describe, expect, it } from 'vitest';
import { automationPreviewSchema, automationRuleSchema } from './automation.js';

const base = { id: 'r1', jobId: 'j1', stageId: 's1', enabled: true, createdBy: 'u1', createdAt: '2026-05-01T10:00:00.000Z' };

describe('automationRuleSchema', () => {
  it('reads both actions, filling the default assignee', () => {
    expect(automationRuleSchema.parse({ ...base, action: { type: 'send_template', templateId: 'e1' } }).action).toEqual({ type: 'send_template', templateId: 'e1' });
    const task = automationRuleSchema.parse({ ...base, action: { type: 'create_task', title: 'Call' } });
    expect(task.action).toEqual({ type: 'create_task', title: 'Call', assignee: 'job_owner' });
  });

  it('reads a rule without trigger or conditions as one that runs on entry, for everyone', () => {
    const rule = automationRuleSchema.parse({ ...base, action: { type: 'send_template', templateId: 'e1' } });
    expect(rule.trigger).toEqual({ type: 'stage_entered' });
    expect(rule.conditions).toEqual({});
  });

  it('reads a preview with counts only (no names for a caller who may not read candidates)', () => {
    expect(automationPreviewSchema.parse({ trigger: 'stage_stuck', matching: 3, firingNow: 1, items: null }).items).toBeNull();
    expect(automationPreviewSchema.safeParse({ trigger: 'scored', matching: 0, firingNow: null, items: [] }).success).toBe(false);
  });

  it('refuses an action that could move or decide, and an object as creator', () => {
    expect(automationRuleSchema.safeParse({ ...base, action: { type: 'move', stageId: 's2' } }).success).toBe(false);
    expect(automationRuleSchema.safeParse({ ...base, createdBy: { id: 'u1', name: null }, action: { type: 'send_template', templateId: 'e1' } }).success).toBe(false);
  });
});
