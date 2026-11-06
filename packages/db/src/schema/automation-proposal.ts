import type { MoveProposalSource, MoveProposalStatus } from '@candydati/domain';
import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';
import { automationRule } from './automation.js';
import { application } from './candidate.js';
import { job } from './job.js';

const organizationRef = () =>
  text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'restrict' });

/**
 * A `propose_move` rule's (or an MCP assistant's, `source`) suggestion to move an application, for a person to confirm (through the normal move, with
 * their own permissions) or dismiss. At most one open proposal per application: the first one stands until a person acts
 * on it, it expires, or the application moves or is decided (then it is `dropped`). Goes with the application.
 */
export const moveProposal = pgTable(
  'move_proposal',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    applicationId: text('application_id')
      .notNull()
      .references(() => application.id, { onDelete: 'cascade' }),
    jobId: text('job_id')
      .notNull()
      .references(() => job.id, { onDelete: 'restrict' }),
    /** The rule that proposed it; kept null when the rule is deleted, so the history stays. */
    ruleId: text('rule_id').references(() => automationRule.id, { onDelete: 'set null' }),
    fromStageId: text('from_stage_id').notNull(),
    toStageId: text('to_stage_id').notNull(),
    /** The creator of the rule, or the person the key or app acts for. People are plain text with no foreign key, like tasks. */
    proposedBy: text('proposed_by').notNull(),
    /** A rule, or a key or connected app over MCP. Existing rows are rules. */
    source: text('source').$type<MoveProposalSource>().notNull().default('rule'),
    /** Plain text given by an assistant (capped in the domain); null for rules. */
    reason: text('reason'),
    status: text('status').$type<MoveProposalStatus>().notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    resolvedBy: text('resolved_by'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('move_proposal_open_application_uidx')
      .on(table.organizationId, table.applicationId)
      .where(sql`${table.status} = 'open'`),
    index('move_proposal_org_job_status_idx').on(table.organizationId, table.jobId, table.status),
    // Backs the hourly expiry.
    index('move_proposal_open_expires_idx').on(table.expiresAt).where(sql`${table.status} = 'open'`),
  ],
);

export type MoveProposalRow = typeof moveProposal.$inferSelect;
