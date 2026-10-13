import { describe, expect, it } from 'vitest';
import { ForbiddenError, ValidationError } from '../../errors.js';
import { buildNotification, seedAutomationWorld, seedNotifications, systemActor, userActor, apiKeyActor, ORG_A, ORG_B } from '../../testing/index.js';
import { listNotifications, markNotificationsRead, unreadNotificationCount } from './notifications.js';

const me = userActor({ id: 'user_test', role: 'interviewer', organizationId: ORG_A });

async function world() {
  const deps = seedAutomationWorld();
  await seedNotifications(deps, [
    buildNotification({ id: 'n1', createdAt: new Date('2026-05-01T00:00:00Z') }),
    buildNotification({ id: 'n2', createdAt: new Date('2026-05-02T00:00:00Z'), readAt: new Date('2026-05-03T00:00:00Z'), applicationId: null, jobId: null }),
    buildNotification({ id: 'n3', createdAt: new Date('2026-05-03T00:00:00Z'), kind: 'task_assigned', applicationId: null, jobId: 'job_1', taskId: 't' }),
    buildNotification({ id: 'other_user', userId: 'admin_1' }),
    buildNotification({ id: 'other_org', organizationId: ORG_B, userId: 'user_test' }),
  ]);
  return deps;
}

describe('listNotifications', () => {
  it('lists only my notifications, newest first, with candidate and job context', async () => {
    const page = await listNotifications(await world(), me, {});
    expect(page.items.map((v) => v.notification.id)).toEqual(['n3', 'n2', 'n1']);
    expect(page.total).toBe(3);
    expect(page.items[2]).toMatchObject({ candidate: { id: 'cand_1', firstName: 'Ada' }, jobTitle: 'Backend Developer' });
    expect(page.items[1]).toMatchObject({ candidate: null, jobTitle: null });
  });

  it('can restrict to unread and paginate', async () => {
    const deps = await world();
    expect((await listNotifications(deps, me, { unread: true })).items.map((v) => v.notification.id)).toEqual(['n3', 'n1']);
    expect((await listNotifications(deps, me, { page: 2, limit: 2 })).items.map((v) => v.notification.id)).toEqual(['n1']);
  });

  it('acts for the user behind an API key, never for a system actor', async () => {
    const deps = await world();
    expect((await listNotifications(deps, apiKeyActor({ organizationId: ORG_A, onBehalfOfUserId: 'user_test' }), {})).total).toBe(3);
    await expect(listNotifications(deps, systemActor({ organizationId: ORG_A }), {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listNotifications(deps, me, { limit: 0 })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('markNotificationsRead', () => {
  it('marks the given ids, only mine and only once', async () => {
    const deps = await world();
    expect(await markNotificationsRead(deps, me, { ids: ['n1', 'other_user', 'n2'] })).toEqual({ updated: 1 });
    expect((await unreadNotificationCount(deps, me, {})).count).toBe(1);
    expect(deps.notifications.snapshot().find((n) => n.id === 'other_user')?.readAt).toBeNull();
  });

  it('marks everything with all: true', async () => {
    const deps = await world();
    expect(await markNotificationsRead(deps, me, { all: true })).toEqual({ updated: 2 });
    expect((await unreadNotificationCount(deps, me, {})).count).toBe(0);
    expect((await unreadNotificationCount(deps, userActor({ id: 'admin_1', organizationId: ORG_A }), {})).count).toBe(1);
  });

  it('needs ids or all, not both and not neither', async () => {
    const deps = await world();
    await expect(markNotificationsRead(deps, me, {})).rejects.toBeInstanceOf(ValidationError);
    await expect(markNotificationsRead(deps, me, { ids: ['n1'], all: true })).rejects.toBeInstanceOf(ValidationError);
    await expect(markNotificationsRead(deps, me, { ids: [] })).rejects.toBeInstanceOf(ValidationError);
  });

  it('never reaches another organization', async () => {
    const deps = await world();
    expect(await markNotificationsRead(deps, userActor({ id: 'user_test', organizationId: ORG_B }), { all: true })).toEqual({ updated: 1 });
    expect((await unreadNotificationCount(deps, me, {})).count).toBe(2);
  });
});
