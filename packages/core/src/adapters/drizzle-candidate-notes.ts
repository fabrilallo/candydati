import { and, count, desc, eq, inArray, schema } from '@candydati/db';
import type { CandidateNote } from '@candydati/domain';
import type { CandidateNoteRepository } from '../candidate-ports.js';
import type { DbExecutor } from './db-executor.js';

type Row = typeof schema.candidateNote.$inferSelect;

/** The batch link is storage only: a note reads the same whether a migration brought it or not. */
const toNote = ({ migrationBatchId: _batch, ...row }: Row): CandidateNote => row;

/** Postgres implementation. Every statement filters by `organization_id`. */
export function createDrizzleCandidateNotes(db: DbExecutor): CandidateNoteRepository {
  const { candidateNote } = schema;
  return {
    async create(note) {
      const [row] = await db.insert(candidateNote).values(note).returning();
      if (!row) throw new Error('candidate_note insert returned no row');
      return toNote(row);
    },
    async listByCandidate(organizationId, candidateId) {
      const rows = await db
        .select()
        .from(candidateNote)
        .where(and(eq(candidateNote.organizationId, organizationId), eq(candidateNote.candidateId, candidateId)))
        .orderBy(desc(candidateNote.createdAt), desc(candidateNote.id));
      return rows.map(toNote);
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
