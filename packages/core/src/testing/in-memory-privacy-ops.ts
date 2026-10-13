import type { DataExport, RetentionRun } from '@tt/domain';
import type { DataExportRepository, ErasureTransaction, RetentionRunRepository, ZipWriter, ZipWriterFactory } from '../privacy-ports.js';
import type { AuditLogRepository } from '../ports.js';
import type { CandidateStore } from './in-memory-candidates.js';
import type { InMemoryNotifications, InMemoryOutbox, InMemoryTasks, InMemoryWebhookDeliveries } from './in-memory-automation.js';
import type { MessagingStore } from './in-memory-messaging.js';

export interface ErasureWorld {
  readonly store: CandidateStore;
  readonly messagingStore: MessagingStore;
  readonly notifications: InMemoryNotifications;
  readonly tasks: InMemoryTasks;
  readonly outbox: InMemoryOutbox;
  readonly deliveries: InMemoryWebhookDeliveries;
  readonly auditLog: AuditLogRepository;
}

/** Same rules as the Postgres store, over the in-memory stores. The candidate store rolls back on failure; the others do not. */
export function createInMemoryErasure(world: ErasureWorld): ErasureTransaction {
  const { store, messagingStore } = world;
  const repositories = {
    auditLog: world.auditLog,
    outbox: world.outbox,
    store: {
      async deleteApplications(organizationId: string, applicationIds: readonly string[]): Promise<readonly string[]> {
        const ids = new Set(applicationIds);
        const own = <T extends { organizationId: string }>(row: T): boolean => row.organizationId === organizationId;
        const doomed = store.read().applications.filter((a) => own(a) && ids.has(a.id));
        const taskIds = new Set(world.tasks.snapshot().filter((t) => own(t) && t.applicationId !== null && ids.has(t.applicationId)).map((t) => t.id));
        world.notifications.purge((n) => own(n) && ((n.applicationId !== null && ids.has(n.applicationId)) || (n.taskId !== null && taskIds.has(n.taskId))));
        world.tasks.purge((t) => taskIds.has(t.id));
        purgeEvents(world, organizationId, 'applicationId', ids);
        messagingStore.write({
          messages: messagingStore.read().messages.filter((m) => !(own(m) && ids.has(m.applicationId))),
          conversations: messagingStore.read().conversations.filter((c) => !(own(c) && ids.has(c.applicationId))),
        });
        store.write({
          extractions: store.read().extractions.filter((e) => !(own(e) && ids.has(e.applicationId))),
          notes: store.read().notes.filter((n) => !(own(n) && n.applicationId !== null && ids.has(n.applicationId))),
          applications: store.read().applications.filter((a) => !(own(a) && ids.has(a.id))),
        });
        return doomed.map((a) => a.cv.key);
      },
      async deleteCandidate(organizationId: string, candidateId: string): Promise<void> {
        purgeEvents(world, organizationId, 'candidateId', new Set([candidateId]));
        store.write({
          notes: store.read().notes.filter((n) => !(n.organizationId === organizationId && n.candidateId === candidateId)),
          candidates: store.read().candidates.filter((c) => !(c.organizationId === organizationId && c.id === candidateId)),
        });
      },
    },
  };
  return {
    async run(work) {
      const before = store.read();
      try {
        return await work(repositories);
      } catch (error) {
        store.write(before);
        throw error;
      }
    },
  };
}

function purgeEvents(world: ErasureWorld, organizationId: string, key: 'applicationId' | 'candidateId', ids: ReadonlySet<string>): void {
  const matches = (event: { organizationId: string; data: Readonly<Record<string, unknown>> }): boolean =>
    event.organizationId === organizationId && typeof event.data[key] === 'string' && ids.has(event.data[key]);
  const eventIds = new Set(world.outbox.snapshot().filter(matches).map((e) => e.id));
  world.deliveries.purge((d) => d.organizationId === organizationId && eventIds.has(d.eventId));
  world.outbox.purge(matches);
}

export interface InMemoryRetentionRuns extends RetentionRunRepository {
  snapshot(): readonly RetentionRun[];
}

export function createInMemoryRetentionRuns(initial: readonly RetentionRun[] = []): InMemoryRetentionRuns {
  let rows: readonly RetentionRun[] = [...initial];
  return {
    async create(run) {
      rows = [...rows, run];
      return run;
    },
    async listRecent(organizationId, limit) {
      return rows
        .filter((r) => r.organizationId === organizationId)
        .toSorted((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .slice(0, limit);
    },
    snapshot: () => rows,
  };
}

export interface InMemoryDataExports extends DataExportRepository {
  snapshot(): readonly DataExport[];
}

export function createInMemoryDataExports(initial: readonly DataExport[] = []): InMemoryDataExports {
  let rows: readonly DataExport[] = [...initial];
  const inOrg = (organizationId: string) => rows.filter((r) => r.organizationId === organizationId);
  return {
    async create(value) {
      rows = [...rows, value];
      return value;
    },
    async save(value) {
      rows = rows.map((r) => (r.organizationId === value.organizationId && r.id === value.id ? value : r));
      return value;
    },
    async findById(organizationId, id) {
      return inOrg(organizationId).find((r) => r.id === id) ?? null;
    },
    async list(organizationId) {
      return inOrg(organizationId).toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async listExpiredAcrossOrganizations(now) {
      return rows.filter((r) => r.expiresAt <= now);
    },
    async delete(organizationId, id) {
      const exists = inOrg(organizationId).some((r) => r.id === id);
      rows = rows.filter((r) => !(r.organizationId === organizationId && r.id === id));
      return exists;
    },
    snapshot: () => rows,
  };
}

export interface FakeZipWriter extends ZipWriter {
  entries(): readonly { readonly path: string; readonly bytes: Uint8Array }[];
}

/** Records entries; `finish` returns them as JSON (`{ path: text }`), enough to inspect an archive in a test. */
export function createFakeZipWriter(): FakeZipWriter {
  let entries: readonly { readonly path: string; readonly bytes: Uint8Array }[] = [];
  return {
    async add(path, bytes) {
      entries = [...entries, { path, bytes }];
    },
    async finish() {
      return new TextEncoder().encode(JSON.stringify(Object.fromEntries(entries.map((e) => [e.path, new TextDecoder().decode(e.bytes)]))));
    },
    entries: () => entries,
  };
}

/** Every writer the factory made, in order, so a test can look into the last archive. */
export function createFakeZipFactory(): ZipWriterFactory & { readonly writers: () => readonly FakeZipWriter[] } {
  let writers: readonly FakeZipWriter[] = [];
  const factory = (): FakeZipWriter => {
    const writer = createFakeZipWriter();
    writers = [...writers, writer];
    return writer;
  };
  return Object.assign(factory, { writers: () => writers });
}
