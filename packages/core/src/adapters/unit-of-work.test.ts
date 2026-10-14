import { randomUUID } from 'node:crypto';
import { createDb, schema, type DbHandle } from '@tt/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApplicationRepository, CandidateDeps } from '../candidate-ports.js';
import { AuditWriteError, ConflictError, NotFoundError, ValidationError } from '../errors.js';
import type { SubmitApplicationDeps } from '../intake-ports.js';
import type { JobDeps, JobRepository } from '../job-ports.js';
import type { DeliverDeps } from '../messaging-ports.js';
import type { AuditLogRepository } from '../ports.js';
import {
  buildApplication,
  buildCandidate,
  buildJob,
  buildMessage,
  buildPrivacyNotice,
  completeJobContent,
  createFakeEmailSender,
  createInMemoryFileStorage,
  createInMemoryTaskQueue,
  fakeAdQualityAnalyzer,
  fakeCvSniffer,
  fakePdfBytes,
  systemActor,
  testMessagingConfig,
  userActor,
  validApplicationForm,
} from '../testing/index.js';
import { coreTestDatabaseUrl } from '../testing/postgres.js';
import type { TransactionPort } from '../transaction.js';
import { decideApplication } from '../use-cases/candidates/decide-application.js';
import { decideApplications } from '../use-cases/candidates/decide-applications.js';
import { moveApplication } from '../use-cases/candidates/move-application.js';
import { submitApplication } from '../use-cases/candidates/submit-application.js';
import { closeJob } from '../use-cases/jobs/close-job.js';
import { updateJob } from '../use-cases/jobs/update-job.js';
import { deliverMessage } from '../use-cases/messaging/deliver-message.js';
import { createDrizzleUnitOfWork, type DrizzleUnitOfWork } from './drizzle-repositories.js';

/**
 * The races of the code review on real Postgres, through the real unit of work. A gate makes both sides read before
 * either writes, so the guarded statements (not an in-memory check) decide who wins.
 */
let handle: DbHandle;
let uow: DrizzleUnitOfWork;

beforeAll(() => {
  handle = createDb(coreTestDatabaseUrl(), 8);
  uow = createDrizzleUnitOfWork(handle.db);
});
afterAll(async () => {
  await handle.close();
});

const recruiter = (organizationId: string) => userActor({ role: 'recruiter', organizationId });
const STAGES = completeJobContent().process.map((stage, index) => ({ ...stage, id: `stage-${index}` }));

interface World {
  readonly org: string;
  readonly slug: string;
  readonly jobId: string;
  readonly candidateId: string;
  readonly applicationIds: readonly string[];
}

async function buildWorld(applications = 1): Promise<World> {
  const r = uow.repositories;
  const org = randomUUID();
  await handle.db.insert(schema.organization).values({ id: org, name: `Org ${org}`, slug: org, createdAt: new Date() });
  const jobId = randomUUID();
  await r.jobs.create(buildJob({ id: jobId, slug: jobId, organizationId: org, status: 'published', publishedAt: new Date(), content: completeJobContent({ title: 'Backend Developer', process: STAGES }) }));
  await r.privacyNotices.create(buildPrivacyNotice({ id: randomUUID(), organizationId: org, version: 1 }));
  const candidateId = randomUUID();
  await r.candidates.create(buildCandidate({ id: candidateId, organizationId: org, email: `${candidateId}@example.org` }));
  const applicationIds: string[] = [];
  for (let index = 0; index < applications; index += 1) {
    const other = index === 0 ? candidateId : randomUUID();
    if (index > 0) await r.candidates.create(buildCandidate({ id: other, organizationId: org, email: `${other}@example.org` }));
    const id = randomUUID();
    await r.applications.create(buildApplication({ id, organizationId: org, jobId, candidateId: other, stageId: 'received' }));
    applicationIds.push(id);
  }
  return { org, slug: org, jobId, candidateId, applicationIds };
}

const clock = { newId: randomUUID, now: () => new Date() };

const candidateDeps = (overrides: Partial<CandidateDeps> = {}): CandidateDeps => {
  const r = uow.repositories;
  return {
    auditLog: r.auditLog,
    transaction: uow.transaction,
    jobTeams: r.jobTeams,
    jobs: r.jobs,
    candidates: r.candidates,
    applications: r.applications,
    notes: r.notes,
    extractions: r.extractions,
    messages: r.messages,
    candidateSearch: r.candidateSearch,
    users: r.users,
    files: createInMemoryFileStorage(),
    queue: createInMemoryTaskQueue(),
    outbox: r.outbox,
    stageEvents: r.stageEvents,
    promises: r.promises,
    ...clock,
    ...overrides,
  };
};

const jobDeps = (overrides: Partial<JobDeps> = {}): JobDeps => {
  const r = uow.repositories;
  return {
    auditLog: r.auditLog,
    transaction: uow.transaction,
    jobTeams: r.jobTeams,
    jobs: r.jobs,
    jobTemplates: r.jobTemplates,
    applicationCounts: r.applicationCounts,
    organizations: r.organizations,
    privacyNotices: r.privacyNotices,
    automationRules: r.automationRules,
    outbox: r.outbox,
    approvals: r.approvals,
    organizationSettings: r.organizationSettings,
    adQuality: fakeAdQualityAnalyzer(),
    adQualityThreshold: 6,
    ...clock,
    ...overrides,
  };
};

/**
 * A unit of work in which `name` is replaced, inside the transaction, by `wrap` of the transaction-bound repository.
 * The returned `outside` object is what the deps hold: the transaction rebinds it by identity, like a root repository.
 */
function wrapped<T extends object>(root: T, wrap: (repository: T) => T): { readonly outside: T; readonly transaction: TransactionPort } {
  const outside = wrap(root);
  const transaction: TransactionPort = {
    run: (work) => uow.transaction.run((repositories) => work(new Map([...repositories, [outside, wrap(repositories.get(root) as T)]]))),
  };
  return { outside, transaction };
}

/** Resolves once `parties` callers are waiting: everyone has read before anyone writes. */
function barrier(parties: number): () => Promise<void> {
  let waiting = 0;
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return async () => {
    waiting += 1;
    if (waiting >= parties) open();
    await opened;
  };
}

/** Applications whose `findById` waits at `gate` after reading. */
const gatedApplications = (gate: () => Promise<void>) =>
  wrapped<ApplicationRepository>(uow.repositories.applications, (repository) => ({
    ...repository,
    findById: async (organizationId, id) => {
      const found = await repository.findById(organizationId, id);
      await gate();
      return found;
    },
  }));

const count = async (sql: string, params: readonly unknown[]): Promise<number> => (await handle.pool.query<{ n: number }>(sql, [...params])).rows[0]?.n ?? 0;
const audits = (target: string, action: string) => count(`select count(*)::int as n from audit_log where target_id = $1 and action = $2`, [target, action]);
const outboxEvents = (key: string, value: string, type: string) => count(`select count(*)::int as n from outbox_event where data ->> $1 = $2 and type = $3`, [key, value, type]);
const decisionEvents = (applicationId: string) => count(`select count(*)::int as n from application_stage_event where application_id = $1 and to_stage_id is null`, [applicationId]);

/** Resolves once some backend of this database waits on a heavyweight lock (a row lock held by another transaction). */
async function untilBlockedOnLock(timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const blocked = `select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`;
  while ((await count(blocked, [])) === 0) {
    if (Date.now() > deadline) throw new Error('no transaction ever waited on a lock');
    await new Promise((resolve) => setImmediate(resolve));
  }
}

const settle = (promises: readonly Promise<unknown>[]) => Promise.allSettled(promises);
const rejected = (results: readonly PromiseSettledResult<unknown>[]) => results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => r.reason as unknown);

describe('decisions and moves on Postgres', () => {
  it('two concurrent decisions: one wins, the other is a ConflictError, one audit row, one event (#2)', async () => {
    const world = await buildWorld();
    const [applicationId] = world.applicationIds as [string];
    const gate = gatedApplications(barrier(2));
    const deps = candidateDeps({ applications: gate.outside, transaction: gate.transaction });
    const results = await settle([
      decideApplication(deps, recruiter(world.org), { applicationId, outcome: 'not_selected' }),
      decideApplication(deps, recruiter(world.org), { applicationId, outcome: 'hired' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejected(results)).toEqual([expect.any(ConflictError)]);
    expect(await audits(applicationId, 'application.decided')).toBe(1);
    expect(await outboxEvents('applicationId', applicationId, 'application.decided')).toBe(1);
    expect(await decisionEvents(applicationId)).toBe(1);
  });

  it('a move racing a decision never reopens the application (#1)', async () => {
    const world = await buildWorld();
    const [applicationId] = world.applicationIds as [string];
    const gate = gatedApplications(barrier(2));
    const deps = candidateDeps({ applications: gate.outside, transaction: gate.transaction });
    const [move, decide] = await settle([
      moveApplication(deps, recruiter(world.org), { applicationId, stageId: 'stage-1' }),
      decideApplication(deps, recruiter(world.org), { applicationId, outcome: 'not_selected' }),
    ]);
    expect(decide?.status).toBe('fulfilled');
    const stored = await uow.repositories.applications.findById(world.org, applicationId);
    expect(stored?.outcome).toBe('not_selected');
    const moved = move?.status === 'fulfilled' ? 1 : 0;
    if (move?.status === 'rejected') expect(move.reason).toBeInstanceOf(ConflictError);
    expect(stored?.stageId).toBe(moved === 1 ? 'stage-1' : 'received');
    expect(await audits(applicationId, 'application.moved')).toBe(moved);
    expect(await outboxEvents('applicationId', applicationId, 'application.moved')).toBe(moved);
    expect(await audits(applicationId, 'application.decided')).toBe(1);
  });

  it('a failing audit append rolls the move back: no stage change, no stage event, no webhook event (#3)', async () => {
    const world = await buildWorld();
    const [applicationId] = world.applicationIds as [string];
    const failing = wrapped<AuditLogRepository>(uow.repositories.auditLog, (repository) => ({ ...repository, append: async () => Promise.reject(new Error('audit down')) }));
    const queue = createInMemoryTaskQueue();
    const deps = candidateDeps({ auditLog: failing.outside, transaction: failing.transaction, queue });
    await expect(moveApplication(deps, recruiter(world.org), { applicationId, stageId: 'stage-0' })).rejects.toBeInstanceOf(AuditWriteError);
    expect((await uow.repositories.applications.findById(world.org, applicationId))?.stageId).toBe('received');
    expect(await count(`select count(*)::int as n from application_stage_event where application_id = $1`, [applicationId])).toBe(0);
    expect(await outboxEvents('applicationId', applicationId, 'application.moved')).toBe(0);
    expect(queue.jobs()).toEqual([]);
    // The retry is a normal move, not `already_in_stage`.
    await expect(moveApplication(candidateDeps(), recruiter(world.org), { applicationId, stageId: 'stage-0' })).resolves.toMatchObject({ from: 'received' });
  });

  it('a bulk decision is all or nothing (#3)', async () => {
    const world = await buildWorld(2);
    const [first, second] = world.applicationIds as [string, string];
    let calls = 0;
    const failing = wrapped<ApplicationRepository>(uow.repositories.applications, (repository) => ({
      ...repository,
      transition: async (...args) => {
        calls += 1;
        if (calls === 2) throw new ConflictError('decided meanwhile');
        return repository.transition(...args);
      },
    }));
    const deps = candidateDeps({ applications: failing.outside, transaction: failing.transaction });
    await expect(decideApplications(deps, recruiter(world.org), { applicationIds: [first, second], outcome: 'not_selected' })).rejects.toBeInstanceOf(ConflictError);
    for (const id of [first, second]) {
      expect((await uow.repositories.applications.findById(world.org, id))?.outcome).toBeNull();
      expect(await audits(id, 'application.decided')).toBe(0);
      expect(await outboxEvents('applicationId', id, 'application.decided')).toBe(0);
    }
  });
});

describe('jobs on Postgres', () => {
  /** Jobs whose `findById` holds its answer until `released` settles: the edit reads `published`, then the close commits. */
  const lateJobs = (released: Promise<unknown>) =>
    wrapped<JobRepository>(uow.repositories.jobs, (repository) => ({
      ...repository,
      findById: async (organizationId, id) => {
        const found = await repository.findById(organizationId, id);
        await released.catch(() => undefined);
        return found;
      },
    }));

  it('an edit read while published never revives a job closed meanwhile (#4)', async () => {
    const world = await buildWorld(0);
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const late = lateJobs(released);
    const edit = updateJob(jobDeps({ jobs: late.outside, transaction: late.transaction }), recruiter(world.org), {
      jobId: world.jobId,
      content: completeJobContent({ title: 'Edited', process: STAGES }),
    });
    await closeJob(jobDeps(), recruiter(world.org), { jobId: world.jobId });
    release();
    await expect(edit).rejects.toBeInstanceOf(ConflictError);
    expect(await uow.repositories.jobs.findById(world.org, world.jobId)).toMatchObject({ status: 'closed', content: { title: 'Backend Developer' } });
    expect(await audits(world.jobId, 'job.updated')).toBe(0);
    expect(await outboxEvents('jobId', world.jobId, 'job.closed')).toBe(1);
  });

  const submitDeps = (overrides: Partial<SubmitApplicationDeps> = {}): SubmitApplicationDeps => {
    const r = uow.repositories;
    return {
      organizations: r.organizations,
      jobs: r.jobs,
      privacyNotices: r.privacyNotices,
      intake: r.intake,
      files: createInMemoryFileStorage(),
      queue: createInMemoryTaskQueue(),
      cvSniffer: fakeCvSniffer,
      ...clock,
      ...overrides,
    };
  };
  const apply = (world: World, deps: SubmitApplicationDeps) =>
    submitApplication(deps, {
      organizationSlug: world.slug,
      jobSlug: world.jobId,
      form: validApplicationForm({ email: `${randomUUID()}@example.org` }),
      cv: { bytes: fakePdfBytes(), declaredName: 'cv.pdf' },
    });

  it('an application read before a close is refused once the close committed (#5)', async () => {
    const world = await buildWorld(0);
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const jobs: JobRepository = {
      ...uow.repositories.jobs,
      findPublishedBySlug: async (organizationId, slug) => {
        const found = await uow.repositories.jobs.findPublishedBySlug(organizationId, slug);
        await released;
        return found;
      },
    };
    const application = apply(world, submitDeps({ jobs }));
    await closeJob(jobDeps(), recruiter(world.org), { jobId: world.jobId });
    release();
    await expect(application).rejects.toBeInstanceOf(NotFoundError);
    expect(await uow.repositories.applications.listByJob(world.org, world.jobId)).toEqual([]);
  });

  it('a close waits for an application being stored, then counts it and is refused (#5)', async () => {
    const world = await buildWorld(0);
    let locked: () => void = () => undefined;
    const holding = new Promise<void>((resolve) => {
      locked = resolve;
    });
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const intake = {
      run: <T,>(work: Parameters<typeof uow.repositories.intake.run<T>>[0]) =>
        uow.repositories.intake.run(async (repositories) => {
          const result = await work(repositories);
          locked();
          await released;
          return result;
        }),
    };
    const application = apply(world, submitDeps({ intake }));
    await holding;
    const close = closeJob(jobDeps(), recruiter(world.org), { jobId: world.jobId });
    // Postgres itself says the close is waiting on the intake's lock: no guess about how long that takes.
    await untilBlockedOnLock();
    release();
    await expect(application).resolves.toEqual({ received: true });
    const error = await close.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).issues).toEqual([{ path: 'applications', message: 'open_applications:1' }]);
    expect((await uow.repositories.jobs.findById(world.org, world.jobId))?.status).toBe('published');
  });
});

describe('email delivery on Postgres', () => {
  it('a delivery task run twice at the same time sends the email once (#12)', async () => {
    const world = await buildWorld();
    const [applicationId] = world.applicationIds as [string];
    const r = uow.repositories;
    const message = buildMessage({ id: randomUUID(), organizationId: world.org, applicationId, candidateId: world.candidateId, sentBy: 'user_test', createdAt: new Date() });
    await r.messages.create(message);
    const sender = createFakeEmailSender();
    const deps: DeliverDeps = {
      auditLog: r.auditLog,
      transaction: uow.transaction,
      organizations: r.organizations,
      candidates: r.candidates,
      applications: r.applications,
      settings: r.settings,
      conversations: r.conversations,
      messages: r.messages,
      promises: r.promises,
      sender,
      config: testMessagingConfig,
      newToken: () => randomUUID().replaceAll('-', '').slice(0, 24),
      now: () => new Date(),
    };
    const worker = systemActor({ organizationId: world.org });
    const results = await Promise.all([1, 2, 3].map(() => deliverMessage(deps, worker, { organizationId: world.org, messageId: message.id })));
    expect(results.toSorted()).toEqual(['sent', 'skipped', 'skipped']);
    expect(sender.sent()).toHaveLength(1);
    expect(await audits(message.id, 'message.sent')).toBe(1);
    expect((await r.messages.findById(world.org, message.id))?.status).toBe('sent');
  });
});
