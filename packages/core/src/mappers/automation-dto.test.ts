import { describe, expect, it } from 'vitest';
import { buildApplication, buildAutomationRule, buildCandidate, buildJob, buildNotification, buildTask } from '../testing/index.js';
import { toAttentionItemDto, toAttentionItemDtos, toAutomationRuleDto, toNotificationDto, toTaskDto } from './automation-dto.js';

const candidate = buildCandidate();
const job = buildJob({ id: 'job_1' });

describe('automation DTO mappers', () => {
  it('maps an attention item with ISO dates and the stage label', () => {
    const view = {
      application: buildApplication({ responseDueAt: new Date('2026-06-02T00:00:00Z') }),
      candidate,
      job,
      stageLabel: 'Candidatura ricevuta',
      state: 'due_soon' as const,
      ownerName: 'Olivia',
    };
    expect(toAttentionItemDto(view)).toEqual({
      applicationId: 'app_1',
      candidate: { id: 'cand_1', firstName: 'Ada', lastName: 'Lovelace' },
      job: { id: 'job_1', title: 'Backend Developer' },
      stage: { id: 'received', label: 'Candidatura ricevuta' },
      responseDueAt: '2026-06-02T00:00:00.000Z',
      state: 'due_soon',
      ownerName: 'Olivia',
    });
    expect(toAttentionItemDtos({ items: [view], total: 1, page: 1, limit: 20 })).toHaveLength(1);
    expect(toAttentionItemDto({ ...view, application: buildApplication(), stageLabel: null }).stage.label).toBeNull();
  });

  it('maps a notification with context and null dates', () => {
    expect(toNotificationDto({ notification: buildNotification({ payload: { escalated: true } }), candidate: { id: 'cand_1', firstName: 'Ada', lastName: 'L' }, jobTitle: 'T' })).toEqual({
      id: 'notif_1',
      kind: 'response_overdue',
      applicationId: 'app_1',
      jobId: 'job_1',
      taskId: null,
      payload: { escalated: true },
      candidate: { id: 'cand_1', firstName: 'Ada', lastName: 'L' },
      jobTitle: 'T',
      createdAt: '2026-01-01T00:00:00.000Z',
      readAt: null,
    });
    expect(toNotificationDto({ notification: buildNotification({ readAt: new Date('2026-02-01T00:00:00Z') }), candidate: null, jobTitle: null }).readAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('maps a task with its assignee', () => {
    expect(toTaskDto({ task: buildTask({ dueAt: new Date('2026-06-03T00:00:00Z') }), assigneeName: 'Olivia', candidate: null, jobTitle: 'T' })).toEqual({
      id: 'task_1',
      title: 'Call the candidate',
      applicationId: 'app_1',
      jobId: 'job_1',
      assignee: { id: 'user_test', name: 'Olivia' },
      candidate: null,
      jobTitle: 'T',
      dueAt: '2026-06-03T00:00:00.000Z',
      createdBy: 'recruiter_1',
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: null,
    });
  });

  it('maps a rule', () => {
    expect(toAutomationRuleDto(buildAutomationRule())).toEqual({
      id: 'rule_1',
      jobId: 'job_1',
      stageId: 'stage-0',
      action: { type: 'create_task', title: 'Prepare the interview', assignee: 'job_owner' },
      enabled: true,
      createdBy: 'recruiter_1',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });
});
