import { and, desc, eq, ilike, inArray, isNotNull, lte, or, schema, sql } from '@candydati/db';
import { normalizeProfileUrl, SOURCED_CONTACT_STATUSES, SOURCING_SOURCES, sourcingEvidenceSchema, type SourcedContact } from '@candydati/domain';
import { z } from 'zod';
import type { SourcedContactRepository, SourcingCandidateLookup, SourcingObjectionRepository } from '../sourcing-ports.js';
import type { DbExecutor } from './db-executor.js';

type Row = typeof schema.sourcedContact.$inferSelect;

/** jsonb and text enums are a boundary: a row that no longer parses is a corrupted contact. */
const toContact = (row: Row): SourcedContact => ({
  ...row,
  source: z.enum(SOURCING_SOURCES).parse(row.source),
  status: z.enum(SOURCED_CONTACT_STATUSES).parse(row.status),
  evidence: z.array(sourcingEvidenceSchema).parse(row.evidence),
});

/** Postgres implementation. Every statement filters by `organization_id`, except the notice lookup and the expiry. */
export function createDrizzleSourcedContacts(db: DbExecutor): SourcedContactRepository {
  const { sourcedContact: t } = schema;
  const one = (organizationId: string, id: string) => and(eq(t.organizationId, organizationId), eq(t.id, id));
  return {
    async create(contact) {
      const [row] = await db.insert(t).values({ ...contact, evidence: [...contact.evidence] }).returning();
      if (!row) throw new Error('sourced contact insert returned no row');
      return toContact(row);
    },
    async findById(organizationId, id) {
      const [row] = await db.select().from(t).where(one(organizationId, id)).limit(1);
      return row ? toContact(row) : null;
    },
    async listByJob(organizationId, jobId) {
      const rows = await db.select().from(t).where(and(eq(t.organizationId, organizationId), eq(t.jobId, jobId))).orderBy(desc(t.createdAt), desc(t.id));
      return rows.map(toContact);
    },
    async findMatching(organizationId, { profileKeys, emails }) {
      const any = [...(profileKeys.length > 0 ? [inArray(t.profileKey, [...profileKeys])] : []), ...(emails.length > 0 ? [inArray(t.email, [...emails])] : [])];
      if (any.length === 0) return [];
      const rows = await db.select().from(t).where(and(eq(t.organizationId, organizationId), or(...any)));
      return rows.map(toContact);
    },
    async update(organizationId, id, patch) {
      const [row] = await db.update(t).set(patch).where(one(organizationId, id)).returning();
      return row ? toContact(row) : null;
    },
    async delete(organizationId, id) {
      return (await db.delete(t).where(one(organizationId, id)).returning({ id: t.id })).length > 0;
    },
    async findByNoticeHash(tokenHash) {
      const [row] = await db.select().from(t).where(eq(t.noticeTokenHash, tokenHash)).limit(1);
      return row ? toContact(row) : null;
    },
    async deleteExpired(now) {
      return (await db.delete(t).where(lte(t.expiresAt, now)).returning({ id: t.id })).length;
    },
  };
}

export function createDrizzleSourcingObjections(db: DbExecutor): SourcingObjectionRepository {
  const { sourcingObjection: t } = schema;
  return {
    async existing(organizationId, fingerprints) {
      if (fingerprints.length === 0) return new Set();
      const rows = await db.select({ fingerprint: t.fingerprint }).from(t).where(and(eq(t.organizationId, organizationId), inArray(t.fingerprint, [...fingerprints])));
      return new Set(rows.map((row) => row.fingerprint));
    },
    async add(organizationId, fingerprints, at) {
      if (fingerprints.length === 0) return;
      await db
        .insert(t)
        .values([...new Set(fingerprints)].map((fingerprint) => ({ organizationId, fingerprint, createdAt: at })))
        .onConflictDoNothing();
    },
  };
}

/** The LinkedIn slug of a profile key (`linkedin.com/in/<slug>`), to find candidates whose stored link has it. */
const linkedinSlug = (key: string): string | null => (key.startsWith('linkedin.com/in/') ? key.slice('linkedin.com/in/'.length) : null);

/**
 * Candidates with one of the emails, or whose LinkedIn link has one of the slugs (narrowed in SQL, then confirmed with the
 * same normalization as the contacts so `…/in/ada` never matches `…/in/adam`).
 */
export function createDrizzleSourcingCandidateLookup(db: DbExecutor): SourcingCandidateLookup {
  const { candidate: t } = schema;
  return {
    async findMatching(organizationId, { profileKeys, emails }) {
      const slugs = profileKeys.flatMap((key) => linkedinSlug(key) ?? []);
      const any = [
        ...(emails.length > 0 ? [inArray(sql`lower(${t.email})`, [...emails])] : []),
        ...slugs.map((slug) => and(isNotNull(t.linkedinUrl), ilike(t.linkedinUrl, `%/in/${slug.replace(/[%_\\]/g, '\\$&')}%`))),
      ];
      if (any.length === 0) return [];
      const rows = await db.select({ id: t.id, email: t.email, linkedinUrl: t.linkedinUrl }).from(t).where(and(eq(t.organizationId, organizationId), or(...any)));
      const keys = new Set(profileKeys);
      const wanted = new Set(emails);
      return rows.filter((row) => wanted.has(row.email.toLowerCase()) || (row.linkedinUrl !== null && keys.has(normalizeProfileUrl(row.linkedinUrl) ?? '')));
    },
  };
}
