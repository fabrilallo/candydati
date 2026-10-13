import { and, eq, inArray, schema, sql } from '@tt/db';
import type { Candidate } from '@tt/domain';
import type { CandidateRepository } from '../candidate-ports.js';
import { ConflictError } from '../errors.js';
import { isUniqueViolation, type DbExecutor } from './db-executor.js';

type Row = typeof schema.candidate.$inferSelect;

export const toCandidate = (row: Row): Candidate => ({ ...row });

const toValues = (candidate: Candidate) => ({ ...candidate, tags: [...candidate.tags] });

/** Postgres implementation. Every statement filters by `organization_id`; emails compare case-insensitively. */
export function createDrizzleCandidates(db: DbExecutor): CandidateRepository {
  const { candidate } = schema;
  const one = async (where: ReturnType<typeof and>): Promise<Candidate | null> => {
    const [row] = await db.select().from(candidate).where(where).limit(1);
    return row ? toCandidate(row) : null;
  };
  return {
    async create(input) {
      try {
        const [row] = await db.insert(candidate).values(toValues(input)).returning();
        if (!row) throw new Error('candidate insert returned no row');
        return toCandidate(row);
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError('A candidate with this email already exists.');
        throw error;
      }
    },
    async save(input) {
      const { id, organizationId, ...values } = toValues(input);
      try {
        const [row] = await db
          .update(candidate)
          .set(values)
          .where(and(eq(candidate.organizationId, organizationId), eq(candidate.id, id)))
          .returning();
        if (!row) throw new Error('candidate not found for save');
        return toCandidate(row);
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError('A candidate with this email already exists.');
        throw error;
      }
    },
    findById: (organizationId, id) => one(and(eq(candidate.organizationId, organizationId), eq(candidate.id, id))),
    findByEmail: (organizationId, email) =>
      one(and(eq(candidate.organizationId, organizationId), sql`lower(${candidate.email}) = ${email.toLowerCase()}`)),
    async findByIds(organizationId, ids) {
      if (ids.length === 0) return [];
      const rows = await db
        .select()
        .from(candidate)
        .where(and(eq(candidate.organizationId, organizationId), inArray(candidate.id, [...ids])));
      return rows.map(toCandidate);
    },
  };
}
