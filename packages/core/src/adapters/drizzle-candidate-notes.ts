import { and, count, desc, eq, inArray, schema } from '@candydati/db';
import type { CandidateNoteRepository } from '../candidate-ports.js';
import type { DbExecutor } from './db-executor.js';

/** Postgres implementation. Every statement filters by `organization_id`. */
export function createDrizzleCandidateNotes(db: DbExecutor): CandidateNoteRepository {
  const { candidateNote } = schema;
  return {
    async create(note) {
      const [row] = await db.insert(candidateNote).values(note).returning();
      if (!row) throw new Error('candidate_note insert returned no row');
      return row;
    },
    async listByCandidate(organizationId, candidateId) {
      return db
        .select()
        .from(candidateNote)
        .where(and(eq(candidateNote.organizationId, organizationId), eq(candidateNote.candidateId, candidateId)))
        .orderBy(desc(candidateNote.createdAt), desc(candidateNote.id));
    },
    async countByApplication(organizationId, applicationIds) {
      const zero = Object.fromEntries(applicationIds.map((id) => [id, 0]));
      if (applicationIds.length === 0) return zero;
      const rows = await db
        .select({ applicationId: candidateNote.applicationId, total: count() })
        .from(candidateNote)
        .where(and(eq(candidateNote.organizationId, organizationId), inArray(candidateNote.applicationId, [...applicationIds])))
        .groupBy(candidateNote.applicationId);
      return { ...zero, ...Object.fromEntries(rows.flatMap((r) => (r.applicationId ? [[r.applicationId, r.total]] : []))) };
    },
  };
}
