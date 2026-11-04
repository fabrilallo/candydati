import { and, asc, eq, inArray, lte, schema } from '@candydati/db';
import {
  automationActionSchema,
  automationConditionsSchema,
  automationTriggerSchema,
  MOVE_PROPOSAL_STATUSES,
  type MoveProposal,
  type TemplateAutomationRule,
} from '@candydati/domain';
import { z } from 'zod';
import type { MoveProposalRepository, TemplateAutomationRepository } from '../proposal-ports.js';
import type { DbExecutor } from './db-executor.js';

type ProposalRow = typeof schema.moveProposal.$inferSelect;
type TemplateRuleRow = typeof schema.jobTemplateAutomation.$inferSelect;

const statusSchema = z.enum(MOVE_PROPOSAL_STATUSES);

const toProposal = (row: ProposalRow): MoveProposal => ({ ...row, status: statusSchema.parse(row.status) });

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

/** jsonb columns are a boundary: a row that no longer parses is a corrupted rule, never copied. */
const toTemplateRule = (row: TemplateRuleRow): TemplateAutomationRule => ({
  id: row.id,
  organizationId: row.organizationId,
  templateId: row.templateId,
  stageId: row.stageId,
  trigger: automationTriggerSchema.parse({ ...row.triggerConfig, type: row.trigger }),
  conditions: automationConditionsSchema.parse(row.conditions),
  action: automationActionSchema.parse({ ...row.config, type: row.action }),
  enabled: row.enabled,
  createdBy: row.createdBy,
  createdAt: row.createdAt,
});

const toTemplateValues = (rule: TemplateAutomationRule) => {
  const { type, ...config } = rule.action;
  const { type: trigger, ...triggerConfig } = rule.trigger;
  return { ...rule, trigger, triggerConfig, conditions: { ...rule.conditions }, action: type, config };
};

export function createDrizzleTemplateAutomations(db: DbExecutor): TemplateAutomationRepository {
  const { jobTemplateAutomation: table } = schema;
  const inOrg = (organizationId: string) => eq(table.organizationId, organizationId);
  return {
    async create(rule) {
      const [row] = await db.insert(table).values(toTemplateValues(rule)).returning();
      if (!row) throw new Error('template automation insert returned no row');
      return toTemplateRule(row);
    },
    async findById(organizationId, id) {
      const [row] = await db.select().from(table).where(and(inOrg(organizationId), eq(table.id, id))).limit(1);
      return row ? toTemplateRule(row) : null;
    },
    async listByTemplate(organizationId, templateId) {
      const rows = await db
        .select()
        .from(table)
        .where(and(inOrg(organizationId), eq(table.templateId, templateId)))
        .orderBy(asc(table.createdAt), asc(table.id));
      return rows.map(toTemplateRule);
    },
    async delete(organizationId, id) {
      const rows = await db.delete(table).where(and(inOrg(organizationId), eq(table.id, id))).returning({ id: table.id });
      return rows.length > 0;
    },
  };
}
