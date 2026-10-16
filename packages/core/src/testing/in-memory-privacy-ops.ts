import { dataExportKey, type DataExport, type RetentionRun } from '@candydati/domain';
import type { DataExportRepository, ErasureTransaction, RetentionRunRepository, ZipStream, ZipStreamFactory, ZipWriter, ZipWriterFactory } from '../privacy-ports.js';
import type { AuditLogRepository } from '../ports.js';
import type { CandidateStore } from './in-memory-candidates.js';
import type { InMemoryNotifications, InMemoryOutbox, InMemoryTasks, InMemoryWebhookDeliveries } from './in-memory-automation.js';
import type { MessagingStore } from './in-memory-messaging.js';
import type { ImportStore } from './in-memory-imports.js';
import type { FeedbackStore } from './in-memory-feedback.js';
import { cell } from './in-memory-transaction.js';

export interface ErasureWorld {
  readonly store: CandidateStore;
  readonly messagingStore: MessagingStore;
  readonly notifications: InMemoryNotifications;
  readonly tasks: InMemoryTasks;
  readonly outbox: InMemoryOutbox;
  readonly deliveries: InMemoryWebhookDeliveries;
  readonly auditLog: AuditLogRepository;
  /** Consent tokens go with their applications. */
  readonly importStore?: ImportStore;
  /** Interview feedback and its requests go with their applications. */
  readonly feedbackStore?: FeedbackStore;
  /** Generated organization exports go on any erasure. */
  readonly dataExports?: InMemoryDataExports;
}

/** Same rules as the Postgres store, over the in-memory stores. The candidate store rolls back on failure; the others do not. */
export function createInMemoryErasure(world: ErasureWorld): ErasureTransaction {
  const { store, messagingStore } = world;
  const repositories = {
    auditLog: world.auditLog,
    outbox: world.outbox,
    store: {
      async lockCandidateApplications(organizationId: string, candidateId: string) {
        const tokens = new Set((world.importStore?.read().tokens ?? []).map((token) => token.applicationId));
        return store
          .read()
          .applications.filter((a) => a.organizationId === organizationId && a.candidateId === candidateId)
          .map((a) => ({ id: a.id, retentionExpiresAt: a.retentionExpiresAt, consentStatus: a.consentStatus, reconfirmationSentAt: a.reconfirmationSentAt ?? null, canBeAsked: tokens.has(a.id) }));
      },
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
        world.feedbackStore?.write({
          feedback: world.feedbackStore.read().feedback.filter((f) => !(own(f) && ids.has(f.applicationId))),
          requests: world.feedbackStore.read().requests.filter((r) => !(own(r) && ids.has(r.applicationId))),
        });
        world.importStore?.write({ tokens: world.importStore.read().tokens.filter((t) => !(own(t) && ids.has(t.applicationId))) });
        const attachments = store.read().attachments.filter((f) => own(f) && ids.has(f.applicationId));
        store.write({
          attachments: store.read().attachments.filter((f) => !(own(f) && ids.has(f.applicationId))),
          extractions: store.read().extractions.filter((e) => !(own(e) && ids.has(e.applicationId))),
          notes: store.read().notes.filter((n) => !(own(n) && n.applicationId !== null && ids.has(n.applicationId))),
          applications: store.read().applications.filter((a) => !(own(a) && ids.has(a.id))),
          stageEvents: store.read().stageEvents.filter((e) => !(own(e) && ids.has(e.applicationId))),
          promises: store.read().promises.filter((p) => !(own(p) && ids.has(p.applicationId))),
        });
        return [...doomed.flatMap((a) => (a.cv ? [a.cv.key] : [])), ...attachments.map((f) => f.key)];
      },
      async deleteDataExports(organizationId: string): Promise<readonly string[]> {
        const removed = world.dataExports?.purge(organizationId) ?? [];
        return removed.map((row) => dataExportKey(organizationId, row.id));
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
  const rows = cell<readonly RetentionRun[]>([...initial]);
  return {
    async create(run) {
      rows.set([...rows.get(), run]);
      return run;
    },
    async listRecent(organizationId, limit) {
      return rows.get()
        .filter((r) => r.organizationId === organizationId)
        .toSorted((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .slice(0, limit);
    },
    snapshot: () => rows.get(),
  };
}

export interface InMemoryDataExports extends DataExportRepository {
  snapshot(): readonly DataExport[];
  /** Removes every export of the organization and returns them. */
  purge(organizationId: string): readonly DataExport[];
}

export function createInMemoryDataExports(initial: readonly DataExport[] = []): InMemoryDataExports {
  const rows = cell<readonly DataExport[]>([...initial]);
  const inOrg = (organizationId: string) => rows.get().filter((r) => r.organizationId === organizationId);
  return {
    async create(value) {
      rows.set([...rows.get(), value]);
      return value;
    },
    async save(value) {
      rows.set(rows.get().map((r) => (r.organizationId === value.organizationId && r.id === value.id ? value : r)));
      return value;
    },
    async findById(organizationId, id) {
      return inOrg(organizationId).find((r) => r.id === id) ?? null;
    },
    async list(organizationId) {
      return inOrg(organizationId).toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async listExpiredAcrossOrganizations(now) {
      return rows.get().filter((r) => r.expiresAt <= now);
    },
    async delete(organizationId, id) {
      const exists = inOrg(organizationId).some((r) => r.id === id);
      rows.set(rows.get().filter((r) => !(r.organizationId === organizationId && r.id === id)));
      return exists;
    },
    purge(organizationId) {
      const removed = inOrg(organizationId);
      rows.set(rows.get().filter((r) => r.organizationId !== organizationId));
      return removed;
    },
    snapshot: () => rows.get(),
  };
}

export interface FakeZipWriter extends ZipWriter, ZipStream {
  finish(): Promise<Uint8Array>;
  entries(): readonly { readonly path: string; readonly bytes: Uint8Array }[];
}

/** Records entries; `finish` returns them as JSON (`{ path: text }`), enough to inspect an archive in a test. */
export function createFakeZipWriter(): FakeZipWriter {
  let entries: readonly { readonly path: string; readonly bytes: Uint8Array }[] = [];
  let aborted: Error | null = null;
  const finishBytes = async (): Promise<Uint8Array> => {
    await closed;
    return new TextEncoder().encode(JSON.stringify(Object.fromEntries(entries.map((e) => [e.path, new TextDecoder().decode(e.bytes)]))));
  };
  let close: () => void = () => undefined;
  const closed = new Promise<void>((resolve) => (close = resolve));
  return {
    async add(path, bytes) {
      entries = [...entries, { path, bytes }];
    },
    async finish() {
      close();
      return finishBytes();
    },
    abort(error) {
      aborted = error;
    },
    get output() {
      return (async function* () {
        if (aborted) throw aborted;
        yield await finishBytes();
      })();
    },
    entries: () => entries,
  };
}

/** Every writer the factory made, in order, so a test can look into the last archive. */
export function createFakeZipFactory(): ZipWriterFactory & ZipStreamFactory & { readonly writers: () => readonly FakeZipWriter[] } {
  let writers: readonly FakeZipWriter[] = [];
  const factory = (): FakeZipWriter => {
    const writer = createFakeZipWriter();
    writers = [...writers, writer];
    return writer;
  };
  return Object.assign(factory, { writers: () => writers });
}
