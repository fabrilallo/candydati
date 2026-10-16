import { randomUUID } from 'node:crypto';
import { createDb, schema, sql, type DbHandle } from '@candydati/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AutomationRunDeps } from '../automation-ports.js';
import {
  buildApplication,
  buildAutomationRule,
  buildCandidate,
  buildJob,
  createFakeEmailIdentity,
  createFakeEmailSender,
  createInMemoryTaskQueue,
  systemActor,
  testMessagingConfig,
} from '../testing/index.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import { runAutomations } from '../use-cases/automations/run-automations.js';
import { createDrizzleUnitOfWork } from './drizzle-repositories.js';

let handle: DbHandle;

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 4);
});
afterAll(async () => {
  await handle.close();
});

async function world() {
  const uow = createDrizzleUnitOfWork(handle.db);
  const r = uow.repositories;
  const org = randomUUID();
  const owner = randomUUID();
  await handle.db.insert(schema.organization).values({ id: org, name: `Org ${org}`, slug: org, createdAt: new Date() });
  await handle.db.insert(schema.user).values({ id: owner, name: 'Mia', email: `${owner}@x.it`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
  await handle.db.insert(schema.member).values({ id: randomUUID(), organizationId: org, userId: owner, role: 'admin', createdAt: new Date() });
  const job = buildJob({ id: randomUUID(), slug: randomUUID(), organizationId: org, status: 'published', publishedAt: new Date(), createdBy: owner });
  await r.jobs.create(job);
  const candidate = buildCandidate({ id: randomUUID(), organizationId: org, email: `${randomUUID()}@x.it` });
  await r.candidates.create(candidate);
  const application = buildApplication({ id: randomUUID(), organizationId: org, jobId: job.id, candidateId: candidate.id, stageId: 'stage-0' });
  await r.applications.create(application);
  const rules = [0, 1].map((index) =>
    buildAutomationRule({ id: randomUUID(), organizationId: org, jobId: job.id, stageId: 'stage-0', createdBy: owner, createdAt: new Date(Date.UTC(2026, 0, 1 + index)), action: { type: 'create_task', title: `Task ${index}`, assignee: 'job_owner' } }),
  );
  for (const rule of rules) await r.rules.create(rule);
  return { uow, org, owner, job, application, rules };
}

describe('runAutomations on Postgres (#9)', () => {
  it('a rule failing on an SQL error rolls back alone: the other rule runs, the failure is notified and both are audited', async () => {
    const w = await world();
    const r = w.uow.repositories;
    // The first rule's task id collides with an existing task: a unique violation inside the transaction.
    const taken = randomUUID();
    await r.tasks.create({ id: taken, organizationId: w.org, applicationId: null, jobId: null, title: 'existing', assigneeId: w.owner, dueAt: null, createdBy: w.owner, createdAt: new Date(), completedAt: null });
    let calls = 0;
    const newId = () => {
      calls += 1;
      return calls === 2 ? taken : randomUUID();
    };
    const deps: AutomationRunDeps = {
      auditLog: r.auditLog,
      transaction: w.uow.transaction,
      jobs: r.jobs,
      organizations: r.organizations,
      candidates: r.candidates,
      applications: r.applications,
      users: r.users,
      templates: r.templates,
      settings: r.settings,
      conversations: r.conversations,
      messages: r.messages,
      promises: r.promises,
      queue: createInMemoryTaskQueue(),
      identity: createFakeEmailIdentity(),
      sender: createFakeEmailSender(),
      config: testMessagingConfig,
      newToken: () => randomUUID(),
      rules: r.rules,
      executions: r.executions,
      tasks: r.tasks,
      notifications: r.notifications,
      members: r.members,
      newId,
      now: () => new Date(),
    };
    const result = await runAutomations(deps, systemActor({ organizationId: w.org }), { organizationId: w.org, applicationId: w.application.id, stageId: 'stage-0' });
    expect(result).toEqual({ executed: 1, failed: 1, skipped: null });
    const tasks = await handle.db.execute<{ title: string }>(sql`select title from task where organization_id = ${w.org} and application_id is not null`);
    expect(tasks.rows.map((row) => row.title)).toEqual(['Task 1']);
    const failed = await handle.db.execute<{ kind: string }>(sql`select kind from notification where organization_id = ${w.org} and kind = 'automation_failed'`);
    expect(failed.rows).toHaveLength(1);
    const audited = await handle.db.execute<{ ok: boolean }>(sql`select (metadata ->> 'ok')::boolean as ok from audit_log where organization_id = ${w.org} and action = 'automation.ran' order by occurred_at`);
    expect(audited.rows.map((row) => row.ok).sort()).toEqual([false, true]);
  });
});
