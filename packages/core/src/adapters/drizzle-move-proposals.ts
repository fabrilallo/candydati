import { and, asc, eq, inArray, lte, schema } from '@candydati/db';
import {
  MOVE_PROPOSAL_SOURCES,
  MOVE_PROPOSAL_STATUSES,
  type MoveProposal,
} from '@candydati/domain';
import { z } from 'zod';
import type { MoveProposalRepository } from '../proposal-ports.js';
import type { DbExecutor } from './db-executor.js';

type ProposalRow = typeof schema.moveProposal.$inferSelect;

const statusSchema = z.enum(MOVE_PROPOSAL_STATUSES);
const sourceSchema = z.enum(MOVE_PROPOSAL_SOURCES);

const toProposal = (row: ProposalRow): MoveProposal => ({ ...row, status: statusSchema.parse(row.status), source: sourceSchema.parse(row.source) });

/** Postgres implementation. Every statement filters by `organization_id`, except the system expiry. */
export function createDrizzleMoveProposals(db: DbExecutor): MoveProposalRepository {
  const { moveProposal } = schema;
  const inOrg = (organizationId: string) => eq(moveProposal.organizationId, organizationId);
  const open = eq(moveProposal.status, 'open');
  return {
    async createIfNoneOpen(proposal) {
      // The partial unique index (one open proposal per application) decides who is first.
      const [row] = await db.insert(moveProposal).values(proposal).onConflictDoNothing().returning();
      return row ? toProposal(row) : null;
    },
    async findById(organizationId, id) {
      const [row] = await db.select().from(moveProposal).where(and(inOrg(organizationId), eq(moveProposal.id, id))).limit(1);
      return row ? toProposal(row) : null;
    },
    async listOpen(query) {
      if (query.jobIds?.length === 0) return [];
      const rows = await db
        .select()
        .from(moveProposal)
        .where(
          and(
            inOrg(query.organizationId),
            open,
            query.applicationId === undefined ? undefined : eq(moveProposal.applicationId, query.applicationId),
            query.jobIds === undefined ? undefined : inArray(moveProposal.jobId, [...query.jobIds]),
          ),
        )
        .orderBy(asc(moveProposal.createdAt), asc(moveProposal.id))
        .limit(query.limit);
      return rows.map(toProposal);
    },
    async resolve(organizationId, id, resolution) {
      const [row] = await db
        .update(moveProposal)
        .set(resolution)
        .where(and(inOrg(organizationId), eq(moveProposal.id, id), open))
        .returning();
      return row ? toProposal(row) : null;
    },
    async dropOpenForApplication(organizationId, applicationId, at) {
      const rows = await db
        .update(moveProposal)
        .set({ status: 'dropped', resolvedAt: at })
        .where(and(inOrg(organizationId), eq(moveProposal.applicationId, applicationId), open))
        .returning({ id: moveProposal.id });
      return rows.length;
    },
    async expireDue(now) {
      const rows = await db
        .update(moveProposal)
        .set({ status: 'expired', resolvedAt: now })
        .where(and(open, lte(moveProposal.expiresAt, now)))
        .returning({ id: moveProposal.id });
      return rows.length;
    },
  };
}
