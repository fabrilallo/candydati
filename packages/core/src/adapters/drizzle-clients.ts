import { and, asc, count, eq, gt, inArray, isNull, schema, sql } from '@candydati/db';
import { clientContactInputSchema, publicJobClientOf, type Client, type ClientContact, type ClientShortlist, type ClientShortlistItem, type JobClientLink } from '@candydati/domain';
import { z } from 'zod';
import type { ClientRepository, JobClientRepository, PublicJobClientDirectory, ShortlistRepository } from '../client-ports.js';
import { ConflictError } from '../errors.js';
import { isUniqueViolation, type DbExecutor } from './db-executor.js';
import { createDrizzleOrganizationSettings } from './drizzle-job-requests.js';

/** jsonb is a boundary: contacts are parsed when read, and a malformed entry is dropped rather than shown. */
const storedContactSchema = clientContactInputSchema.extend({ id: z.string().min(1) });
const contactsOf = (value: unknown): readonly ClientContact[] =>
  (Array.isArray(value) ? value : []).flatMap((entry) => {
    const parsed = storedContactSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });

const toClient = (row: typeof schema.client.$inferSelect): Client => ({ ...row, contacts: contactsOf(row.contacts) });
const toLink = (row: typeof schema.jobClient.$inferSelect): JobClientLink => ({ ...row });
const toShortlist = (row: typeof schema.clientShortlist.$inferSelect): ClientShortlist => ({ ...row });
const toItem = (row: typeof schema.clientShortlistItem.$inferSelect): ClientShortlistItem => ({
  ...row,
  sharedNoteIds: Array.isArray(row.sharedNoteIds) ? row.sharedNoteIds.filter((id): id is string => typeof id === 'string') : [],
});

const nameTaken = (error: unknown): never => {
  if (isUniqueViolation(error)) throw new ConflictError('client_name_taken');
  throw error;
};

/** Postgres implementation. Every statement filters by `organization_id`. */
export function createDrizzleClients(db: DbExecutor): ClientRepository {
  const { client: table } = schema;
  const one = (organizationId: string, id: string) => and(eq(table.organizationId, organizationId), eq(table.id, id));
  return {
    async list(organizationId, { includeArchived }) {
      const rows = await db
        .select()
        .from(table)
        .where(and(eq(table.organizationId, organizationId), includeArchived ? undefined : isNull(table.archivedAt)))
        .orderBy(asc(sql`lower(${table.name})`), asc(table.id));
      return rows.map(toClient);
    },
    async findById(organizationId, id) {
      const [row] = await db.select().from(table).where(one(organizationId, id)).limit(1);
      return row ? toClient(row) : null;
    },
    async create(client) {
      try {
        const [row] = await db.insert(table).values({ ...client, contacts: [...client.contacts] }).returning();
        if (!row) throw new Error('client insert returned no row');
        return toClient(row);
      } catch (error) {
        return nameTaken(error);
      }
    },
    async update(organizationId, id, patch) {
      try {
        const [row] = await db.update(table).set({ ...patch, contacts: [...patch.contacts] }).where(one(organizationId, id)).returning();
        return row ? toClient(row) : null;
      } catch (error) {
        return nameTaken(error);
      }
    },
    async setArchived(organizationId, id, archivedAt, updatedAt) {
      const [row] = await db.update(table).set({ archivedAt, updatedAt }).where(one(organizationId, id)).returning();
      return row ? toClient(row) : null;
    },
  };
}

export function createDrizzleJobClients(db: DbExecutor): JobClientRepository {
  const { jobClient: table } = schema;
  return {
    async findByJob(organizationId, jobId) {
      const [row] = await db.select().from(table).where(and(eq(table.organizationId, organizationId), eq(table.jobId, jobId))).limit(1);
      return row ? toLink(row) : null;
    },
    async listByJobs(organizationId, jobIds) {
      if (jobIds.length === 0) return [];
      const rows = await db.select().from(table).where(and(eq(table.organizationId, organizationId), inArray(table.jobId, [...jobIds])));
      return rows.map(toLink);
    },
    async listJobIdsByClient(organizationId, clientId) {
      const rows = await db.select({ jobId: table.jobId }).from(table).where(and(eq(table.organizationId, organizationId), eq(table.clientId, clientId)));
      return rows.map((row) => row.jobId);
    },
    async countByClient(organizationId) {
      const rows = await db.select({ clientId: table.clientId, jobs: count() }).from(table).where(eq(table.organizationId, organizationId)).groupBy(table.clientId);
      return Object.fromEntries(rows.map((row) => [row.clientId, row.jobs]));
    },
    async set(link) {
      await db
        .insert(table)
        .values(link)
        .onConflictDoUpdate({ target: table.jobId, set: { clientId: link.clientId, display: link.display, updatedBy: link.updatedBy, updatedAt: link.updatedAt }, setWhere: eq(table.organizationId, link.organizationId) });
    },
    async remove(organizationId, jobId) {
      await db.delete(table).where(and(eq(table.organizationId, organizationId), eq(table.jobId, jobId)));
    },
  };
}

/** One join for the public pages: the client's public face only, never its contacts. */
export function createDrizzlePublicJobClients(db: DbExecutor): PublicJobClientDirectory {
  const settings = createDrizzleOrganizationSettings(db);
  const { jobClient, client } = schema;
  return {
    async forJobs(organizationId, jobIds) {
      if (jobIds.length === 0) return {};
      const rows = await db
        .select({ jobId: jobClient.jobId, display: jobClient.display, name: client.name, website: client.website, logoUrl: client.logoUrl })
        .from(jobClient)
        .innerJoin(client, and(eq(client.id, jobClient.clientId), eq(client.organizationId, jobClient.organizationId)))
        .where(and(eq(jobClient.organizationId, organizationId), inArray(jobClient.jobId, [...jobIds])));
      if (rows.length === 0) return {};
      const { agencyAuthorization } = await settings.get(organizationId);
      return Object.fromEntries(rows.map((row) => [row.jobId, publicJobClientOf(row, row.display, agencyAuthorization)]));
    },
  };
}

export function createDrizzleShortlists(db: DbExecutor): ShortlistRepository {
  const { clientShortlist: lists, clientShortlistItem: items } = schema;
  const one = (organizationId: string, id: string) => and(eq(lists.organizationId, organizationId), eq(lists.id, id));
  return {
    async create(shortlist, newItems) {
      try {
        await db.transaction(async (tx) => {
          await tx.insert(lists).values(shortlist);
          if (newItems.length > 0) await tx.insert(items).values(newItems.map((item) => ({ ...item, sharedNoteIds: [...item.sharedNoteIds] })));
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError('Token already used.');
        throw error;
      }
    },
    async findById(organizationId, id) {
      const [row] = await db.select().from(lists).where(one(organizationId, id)).limit(1);
      return row ? toShortlist(row) : null;
    },
    async findByTokenHash(tokenHash) {
      const [row] = await db.select().from(lists).where(eq(lists.tokenHash, tokenHash)).limit(1);
      return row ? toShortlist(row) : null;
    },
    async listByJob(organizationId, jobId) {
      const rows = await db.select().from(lists).where(and(eq(lists.organizationId, organizationId), eq(lists.jobId, jobId))).orderBy(sql`${lists.createdAt} desc`, asc(lists.id));
      return rows.map(toShortlist);
    },
    async listItems(organizationId, shortlistIds) {
      if (shortlistIds.length === 0) return [];
      const rows = await db.select().from(items).where(and(eq(items.organizationId, organizationId), inArray(items.shortlistId, [...shortlistIds]))).orderBy(asc(items.position));
      return rows.map(toItem).toSorted((a, b) => shortlistIds.indexOf(a.shortlistId) - shortlistIds.indexOf(b.shortlistId) || a.position - b.position);
    },
    async listItemsByApplication(organizationId, applicationId) {
      const rows = await db
        .select({ item: items })
        .from(items)
        .innerJoin(lists, and(eq(lists.id, items.shortlistId), eq(lists.organizationId, items.organizationId)))
        .where(and(eq(items.organizationId, organizationId), eq(items.applicationId, applicationId)))
        .orderBy(asc(lists.createdAt), asc(lists.id));
      return rows.map((row) => toItem(row.item));
    },
    async revoke(organizationId, id, at) {
      const rows = await db.update(lists).set({ revokedAt: at }).where(and(one(organizationId, id), isNull(lists.revokedAt))).returning({ id: lists.id });
      return rows.length > 0;
    },
    async markOpened(organizationId, id, at) {
      const rows = await db.update(lists).set({ firstOpenedAt: at }).where(and(one(organizationId, id), isNull(lists.firstOpenedAt))).returning({ id: lists.id });
      return rows.length > 0;
    },
    async answer(organizationId, shortlistId, itemId, write) {
      const rows = await db
        .update(items)
        .set({ answer: write.answer, answerReason: write.reason, answeredAt: write.at })
        .where(and(eq(items.organizationId, organizationId), eq(items.shortlistId, shortlistId), eq(items.id, itemId), isNull(items.answer)))
        .returning({ id: items.id });
      return rows.length > 0;
    },
    async markCandidateNotified(organizationId, itemIds, at) {
      if (itemIds.length === 0) return;
      await db.update(items).set({ candidateNotifiedAt: at }).where(and(eq(items.organizationId, organizationId), inArray(items.id, [...itemIds])));
    },
    async rotateToken(organizationId, id, expectedTokenHash, patch) {
      const [row] = await db.update(lists).set(patch).where(and(one(organizationId, id), eq(lists.tokenHash, expectedTokenHash))).returning();
      return row ? toShortlist(row) : null;
    },
    async listOpenAcrossOrganizations(now) {
      const rows = await db.select().from(lists).where(and(isNull(lists.revokedAt), gt(lists.expiresAt, now))).orderBy(asc(lists.createdAt));
      return rows.map(toShortlist);
    },
    async deleteItemsOfApplications(organizationId, applicationIds) {
      if (applicationIds.length === 0) return;
      await db.delete(items).where(and(eq(items.organizationId, organizationId), inArray(items.applicationId, [...applicationIds])));
    },
  };
}
