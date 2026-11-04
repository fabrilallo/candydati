import type { AutomationActionType, AutomationTriggerType, MoveProposalStatus } from '@candydati/domain';
import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';
import { automationRule } from './automation.js';
import { application } from './candidate.js';
import { job, jobTemplate } from './job.js';

const organizationRef = () =>
  text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'restrict' });

/**
 * A `propose_move` rule's suggestion to move an application, for a person to confirm (through the normal move, with
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
    /** The creator of the rule. People are plain text with no foreign key, like tasks. */
    proposedBy: text('proposed_by').notNull(),
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

/**
 * A rule kept with a job template, same shape as `automation_rule` with the template instead of the job. A job created
 * from the template gets a copy of each one whose stage it still has. Goes with the template.
 */
export const jobTemplateAutomation = pgTable(
  'job_template_automation',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    templateId: text('template_id')
      .notNull()
      .references(() => jobTemplate.id, { onDelete: 'cascade' }),
    stageId: text('stage_id').notNull(),
    trigger: text('trigger').$type<AutomationTriggerType>().notNull(),
    triggerConfig: jsonb('trigger_config').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    conditions: jsonb('conditions').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    action: text('action').$type<AutomationActionType>().notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('job_template_automation_org_template_idx').on(table.organizationId, table.templateId)],
);

export type MoveProposalRow = typeof moveProposal.$inferSelect;
export type JobTemplateAutomationRow = typeof jobTemplateAutomation.$inferSelect;
