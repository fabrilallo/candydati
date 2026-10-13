import { describe, expect, it } from 'vitest';
import { automationActionSchema, automationRuleInputSchema } from './automation.js';

describe('automationActionSchema', () => {
  it('accepts send_template and create_task, with the job owner as default assignee', () => {
    expect(automationActionSchema.parse({ type: 'send_template', templateId: 'default:receipt' })).toEqual({
      type: 'send_template',
      templateId: 'default:receipt',
    });
    expect(automationActionSchema.parse({ type: 'create_task', title: 'Call' })).toEqual({
      type: 'create_task',
      title: 'Call',
      assignee: 'job_owner',
    });
  });

  it('has no move and no decide action (principle 4)', () => {
    for (const type of ['move', 'decide', 'move_application', 'reject']) {
      expect(automationActionSchema.safeParse({ type, stageId: 'x', outcome: 'not_selected' }).success).toBe(false);
    }
  });

  it('refuses unknown keys and bad values', () => {
    expect(automationActionSchema.safeParse({ type: 'send_template', templateId: 'a', outcome: 'hired' }).success).toBe(false);
    expect(automationActionSchema.safeParse({ type: 'create_task', title: ' ' }).success).toBe(false);
    expect(automationActionSchema.safeParse({ type: 'create_task', title: 'x', dueInDays: -1 }).success).toBe(false);
  });
});

describe('automationRuleInputSchema', () => {
  it('enables the rule by default', () => {
    const parsed = automationRuleInputSchema.parse({ stageId: 'received', action: { type: 'create_task', title: 'T' } });
    expect(parsed.enabled).toBe(true);
  });
});
