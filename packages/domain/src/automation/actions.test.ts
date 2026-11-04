import { describe, expect, it } from 'vitest';
import { actionPeople, assignTaskTitle, automationActionSchema } from './actions.js';

const parse = (value: unknown) => automationActionSchema.safeParse(value);

describe('automationActionSchema: the actions of part 2', () => {
  it('add_tag stores the tag lowercase and trimmed', () => {
    expect(automationActionSchema.parse({ type: 'add_tag', tag: '  Senior ' })).toEqual({ type: 'add_tag', tag: 'senior' });
    expect(parse({ type: 'add_tag', tag: ' ' }).success).toBe(false);
    expect(parse({ type: 'add_tag', tag: 'x'.repeat(200) }).success).toBe(false);
  });

  it('assign defaults to the job owner', () => {
    expect(automationActionSchema.parse({ type: 'assign' })).toEqual({ type: 'assign', assignee: 'job_owner' });
    expect(automationActionSchema.parse({ type: 'assign', assignee: 'user_2', dueInDays: 3 })).toEqual({ type: 'assign', assignee: 'user_2', dueInDays: 3 });
    expect(parse({ type: 'assign', dueInDays: 91 }).success).toBe(false);
  });

  it('request_feedback takes no field', () => {
    expect(automationActionSchema.parse({ type: 'request_feedback' })).toEqual({ type: 'request_feedback' });
    expect(parse({ type: 'request_feedback', interviewer: 'x' }).success).toBe(false);
  });

  it('notify needs recipients for in_app and email, and none for webhook', () => {
    expect(automationActionSchema.parse({ type: 'notify', channel: 'in_app', recipients: ['job_owner', 'job_owner', 'u2'] })).toEqual({
      type: 'notify',
      channel: 'in_app',
      recipients: ['job_owner', 'u2'],
    });
    expect(automationActionSchema.parse({ type: 'notify', channel: 'webhook' })).toEqual({ type: 'notify', channel: 'webhook', recipients: [] });
    expect(parse({ type: 'notify', channel: 'email', recipients: [] }).success).toBe(false);
    expect(parse({ type: 'notify', channel: 'webhook', recipients: ['u2'] }).success).toBe(false);
    expect(parse({ type: 'notify', channel: 'sms', recipients: ['u2'] }).success).toBe(false);
    expect(parse({ type: 'notify', channel: 'in_app', recipients: Array.from({ length: 11 }, (_, i) => `u${i}`) }).success).toBe(false);
  });

  it('propose_move names a target stage and nothing that decides', () => {
    expect(automationActionSchema.parse({ type: 'propose_move', toStageId: 'stage-2' })).toEqual({ type: 'propose_move', toStageId: 'stage-2' });
    expect(parse({ type: 'propose_move' }).success).toBe(false);
    expect(parse({ type: 'propose_move', toStageId: 'stage-2', outcome: 'not_selected' }).success).toBe(false);
    expect(parse({ type: 'propose_move', toStageId: 'stage-2', confirm: true }).success).toBe(false);
  });
});

describe('actionPeople', () => {
  it('lists assignees and recipients, nobody for the others', () => {
    expect(actionPeople({ type: 'assign', assignee: 'u1' })).toEqual(['u1']);
    expect(actionPeople({ type: 'create_task', title: 'T', assignee: 'job_owner' })).toEqual(['job_owner']);
    expect(actionPeople({ type: 'notify', channel: 'in_app', recipients: ['u1', 'u2'] })).toEqual(['u1', 'u2']);
    expect(actionPeople({ type: 'add_tag', tag: 'x' })).toEqual([]);
  });
});

describe('assignTaskTitle', () => {
  it('follows the job language', () => {
    expect(assignTaskTitle('it')).toBe('Segui questa candidatura');
    expect(assignTaskTitle('en')).toBe('Follow this application');
  });
});
