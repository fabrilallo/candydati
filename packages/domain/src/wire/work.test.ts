import { describe, expect, it } from 'vitest';
import { attentionItemSchema, decidedSchema, OPEN_APPLICATIONS_PREFIX, notificationSchema, taskSchema, unreadCountSchema } from './work.js';

const at = '2026-05-01T10:00:00.000Z';
const person = { id: 'c1', firstName: 'Giulia', lastName: 'Neri' };

describe('work wire schemas', () => {
  it('reads an attention item as the api sends it', () => {
    const item = { applicationId: 'a1', candidate: person, job: { id: 'j1', title: 'Dev' }, stage: { id: 's1', label: null }, responseDueAt: at, state: 'overdue', ownerName: 'Elena' };
    expect(attentionItemSchema.parse(item)).toEqual(item);
    expect(attentionItemSchema.safeParse({ ...item, state: 'on_track' }).success).toBe(false);
    expect(attentionItemSchema.safeParse({ ...item, ownerName: null }).success).toBe(false);
  });

  it('reads a notification with ids and counts in the payload', () => {
    const n = { id: 'n1', kind: 'task_due', applicationId: null, jobId: 'j1', taskId: 't1', payload: { count: 2, ok: true, x: null }, candidate: null, jobTitle: 'Dev', createdAt: at, readAt: null };
    expect(notificationSchema.parse(n)).toEqual(n);
    expect(notificationSchema.safeParse({ ...n, kind: 'mystery' }).success).toBe(false);
    expect(notificationSchema.safeParse({ ...n, payload: { nested: {} } }).success).toBe(false);
  });

  it('reads the unread count and the bulk decision', () => {
    expect(unreadCountSchema.parse({ count: 3 })).toEqual({ count: 3 });
    expect(unreadCountSchema.safeParse({ unread: 3 }).success).toBe(false);
    expect(decidedSchema.parse({ decided: 0 })).toEqual({ decided: 0 });
  });

  it('reads a task with its assignee object and a creator id', () => {
    const task = { id: 't1', title: 'Call', applicationId: null, jobId: null, assignee: { id: 'u1', name: 'Elena' }, candidate: null, jobTitle: null, dueAt: null, createdBy: 'u2', createdAt: at, completedAt: null };
    expect(taskSchema.parse(task)).toEqual(task);
    expect(taskSchema.safeParse({ ...task, assignee: { id: 'u1', name: null } }).success).toBe(false);
    expect(taskSchema.safeParse({ ...task, createdBy: { id: 'u2', name: 'x' } }).success).toBe(false);
  });

  it('names the issue of a refused close', () => {
    expect(OPEN_APPLICATIONS_PREFIX).toBe('open_applications:');
  });
});
