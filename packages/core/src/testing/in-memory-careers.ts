import { careersPageDocumentSchema, type Locale } from '@candydati/domain';
import {
  ImageRejectedError,
  type CareersDeps,
  type CareersMediaRecord,
  type CareersMediaRepository,
  type CareersPageRecord,
  type CareersPageRepository,
  type ImageTranscoder,
} from '../careers-ports.js';
import type { PublicOrganization } from '../job-ports.js';
import { createInMemoryAuditLog, type InMemoryAuditLog } from './in-memory-audit-log.js';
import { createInMemoryFileStorage, createInMemoryTaskQueue, type InMemoryFileStorage, type InMemoryTaskQueue } from './in-memory-files.js';
import { createInMemoryOrganizationDirectory } from './in-memory-jobs.js';
import { cell, createInMemoryTransaction } from './in-memory-transaction.js';

export interface InMemoryCareersPages extends CareersPageRepository {
  snapshot(): readonly CareersPageRecord[];
}

/** Validates on write and on read, like the Postgres adapter. */
export function createInMemoryCareersPages(): InMemoryCareersPages {
  const rows = cell<readonly CareersPageRecord[]>([]);
  const parse = (record: CareersPageRecord): CareersPageRecord => ({
    ...record,
    draft: careersPageDocumentSchema.parse(record.draft),
    published: record.published === null ? null : careersPageDocumentSchema.parse(record.published),
  });
  /** Like the Postgres adapter: writes only when the stored revision is the expected one (0 = no row yet). */
  const write = (organizationId: string, expectedRevision: number, change: (current: CareersPageRecord | undefined) => Omit<CareersPageRecord, 'revision'>): CareersPageRecord | null => {
    const current = rows.get().find((row) => row.organizationId === organizationId);
    if ((current?.revision ?? 0) !== expectedRevision) return null;
    const next = parse({ ...change(current), revision: expectedRevision + 1 });
    rows.set([...rows.get().filter((row) => row.organizationId !== organizationId), next]);
    return next;
  };
  return {
    async find(organizationId) {
      const row = rows.get().find((candidate) => candidate.organizationId === organizationId);
      return row ? parse(row) : null;
    },
    async saveDraft(organizationId, draft, at, _userId, expectedRevision) {
      return write(organizationId, expectedRevision, (current) => ({ organizationId, draft, published: current?.published ?? null, draftUpdatedAt: at, publishedAt: current?.publishedAt ?? null }));
    },
    async publish(organizationId, document, at, _userId, expectedRevision) {
      return write(organizationId, expectedRevision, () => ({ organizationId, draft: document, published: document, draftUpdatedAt: at, publishedAt: at }));
    },
    snapshot: () => rows.get(),
  };
}

export interface InMemoryCareersMedia extends CareersMediaRepository {
  snapshot(): readonly CareersMediaRecord[];
}

export function createInMemoryCareersMedia(initial: readonly CareersMediaRecord[] = [], options: { readonly failInsert?: Error } = {}): InMemoryCareersMedia {
  const rows = cell<readonly CareersMediaRecord[]>(initial);
  const inOrganization = (organizationId: string) => rows.get().filter((row) => row.organizationId === organizationId);
  return {
    async insert(record) {
      if (options.failInsert) throw options.failInsert;
      rows.set([...rows.get(), record]);
      return record;
    },
    async findById(organizationId, id) {
      return inOrganization(organizationId).find((row) => row.id === id) ?? null;
    },
    async findByIds(organizationId, ids) {
      return inOrganization(organizationId).filter((row) => ids.includes(row.id));
    },
    async list(organizationId, limit) {
      return inOrganization(organizationId)
        .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit);
    },
    async count(organizationId) {
      return inOrganization(organizationId).length;
    },
    async delete(organizationId, id) {
      const before = rows.get().length;
      rows.set(rows.get().filter((row) => !(row.organizationId === organizationId && row.id === id)));
      return rows.get().length < before;
    },
    snapshot: () => rows.get(),
  };
}

/** Reads the size from two bytes after the magic (a fake format for tests) and "re-encodes" by tagging the bytes. */
export function fakeImageTranscoder(options: { readonly width?: number; readonly height?: number; readonly reject?: 'image_unreadable' | 'image_too_big' } = {}): ImageTranscoder {
  const width = options.width ?? 2400;
  const height = options.height ?? 1600;
  return {
    async probe() {
      return options.reject === 'image_unreadable' ? null : { width, height };
    },
    async transcode(_bytes, widthsFor) {
      if (options.reject) throw new ImageRejectedError(options.reject);
      return {
        width,
        height,
        variants: widthsFor(width).map((variant) => ({ width: variant, bytes: new TextEncoder().encode(`webp-${variant}`) })),
      };
    },
  };
}

export const CAREERS_ORG: PublicOrganization = { id: 'org_test', name: 'Acme', slug: 'acme', logo: null };
export const OTHER_ORG: PublicOrganization = { id: 'org_other', name: 'Other', slug: 'other', logo: null };

export type TestCareersDeps = CareersDeps & {
  readonly auditLog: InMemoryAuditLog;
  readonly careersPages: InMemoryCareersPages;
  readonly careersMedia: InMemoryCareersMedia;
  readonly files: InMemoryFileStorage;
  readonly queue: InMemoryTaskQueue;
};

export function createTestCareersDeps(overrides: Partial<TestCareersDeps> & { readonly defaultLocale?: Locale } = {}): TestCareersDeps {
  let counter = 0;
  return {
    auditLog: createInMemoryAuditLog(),
    transaction: createInMemoryTransaction(),
    careersPages: createInMemoryCareersPages(),
    careersMedia: createInMemoryCareersMedia(),
    organizations: createInMemoryOrganizationDirectory([CAREERS_ORG, OTHER_ORG]),
    files: createInMemoryFileStorage(),
    queue: createInMemoryTaskQueue(),
    images: fakeImageTranscoder(),
    sha256: (bytes) => Array.from(bytes.subarray(0, 32), (byte) => byte.toString(16).padStart(2, '0')).join('').padEnd(64, '0'),
    defaultLocale: 'it',
    newId: () => {
      counter += 1;
      return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
    },
    now: () => new Date('2026-06-01T10:00:00.000Z'),
    ...overrides,
  };
}

/** The revision an editor would hold now (for tests that save or publish without a conflict). */
export const revisionOf = async (deps: Pick<CareersDeps, 'careersPages'>, organizationId = 'org_test'): Promise<number> =>
  (await deps.careersPages.find(organizationId))?.revision ?? 0;
