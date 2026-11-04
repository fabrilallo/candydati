import { and, asc, eq, inArray, schema } from '@candydati/db';
import { automationActionSchema, automationConditionsSchema, automationTriggerSchema, TIME_BASED_TRIGGERS, type AutomationRule } from '@candydati/domain';
import type { AutomationExecutionRepository, AutomationRuleRepository } from '../automation-ports.js';
import type { DbExecutor } from './db-executor.js';

type Row = typeof schema.automationRule.$inferSelect;

/** `config`, `trigger_config` and `conditions` are jsonb: a boundary. A row that no longer parses is a corrupted rule, not something to run. */
const toRule = (row: Row): AutomationRule => ({
  id: row.id,
  organizationId: row.organizationId,
  jobId: row.jobId,
  stageId: row.stageId,
  trigger: automationTriggerSchema.parse({ ...row.triggerConfig, type: row.trigger }),
  conditions: automationConditionsSchema.parse(row.conditions),
  action: automationActionSchema.parse({ ...row.config, type: row.action }),
  enabled: row.enabled,
  createdBy: row.createdBy,
  createdAt: row.createdAt,
});

const toValues = (rule: AutomationRule) => {
  const { type, ...config } = rule.action;
  const { type: trigger, ...triggerConfig } = rule.trigger;
  return {
    id: rule.id,
    organizationId: rule.organizationId,
    jobId: rule.jobId,
    stageId: rule.stageId,
    trigger,
    triggerConfig,
    conditions: { ...rule.conditions },
    action: type,
    config,
    enabled: rule.enabled,
    createdBy: rule.createdBy,
    createdAt: rule.createdAt,
  };
};

/** Postgres implementation. Every statement filters by `organization_id`. */
export function createDrizzleAutomationRules(db: DbExecutor): AutomationRuleRepository {
  const { automationRule } = schema;
  const inOrg = (organizationId: string) => eq(automationRule.organizationId, organizationId);
  return {
    async create(rule) {
      const [row] = await db.insert(automationRule).values(toValues(rule)).returning();
      if (!row) throw new Error('automation rule insert returned no row');
      return toRule(row);
    },
    async save(rule) {
      const { id, organizationId, ...values } = toValues(rule);
      const [row] = await db.update(automationRule).set(values).where(and(inOrg(organizationId), eq(automationRule.id, id))).returning();
      if (!row) throw new Error('automation rule not found for save');
      return toRule(row);
    },
    async findById(organizationId, id) {
      const [row] = await db.select().from(automationRule).where(and(inOrg(organizationId), eq(automationRule.id, id))).limit(1);
      return row ? toRule(row) : null;
    },
    async listByJob(organizationId, jobId) {
      const rows = await db
        .select()
        .from(automationRule)
        .where(and(inOrg(organizationId), eq(automationRule.jobId, jobId)))
        .orderBy(asc(automationRule.createdAt), asc(automationRule.id));
      return rows.map(toRule);
    },
    async listEnabledByStage(organizationId, jobId, stageId, trigger) {
      const rows = await db
        .select()
        .from(automationRule)
        .where(
          and(
            inOrg(organizationId),
            eq(automationRule.jobId, jobId),
            eq(automationRule.stageId, stageId),
            eq(automationRule.trigger, trigger),
            eq(automationRule.enabled, true),
          ),
        )
        .orderBy(asc(automationRule.createdAt), asc(automationRule.id));
      return rows.map(toRule);
    },
    async listEnabledTimeBasedAcrossOrganizations() {
      const rows = await db
        .select()
        .from(automationRule)
        .where(and(eq(automationRule.enabled, true), inArray(automationRule.trigger, [...TIME_BASED_TRIGGERS])))
        .orderBy(asc(automationRule.organizationId), asc(automationRule.jobId), asc(automationRule.createdAt), asc(automationRule.id));
      return rows.map(toRule);
    },
    async delete(organizationId, id) {
      const rows = await db.delete(automationRule).where(and(inOrg(organizationId), eq(automationRule.id, id))).returning({ id: automationRule.id });
      return rows.length > 0;
    },
    async deleteByStages(organizationId, jobId, stageIds) {
      if (stageIds.length === 0) return 0;
      const rows = await db
        .delete(automationRule)
        .where(and(inOrg(organizationId), eq(automationRule.jobId, jobId), inArray(automationRule.stageId, [...stageIds])))
        .returning({ id: automationRule.id });
      return rows.length;
    },
  };
}

/** Postgres implementation: the unique entry index decides, `ON CONFLICT DO NOTHING` says who was first. */
export function createDrizzleAutomationExecutions(db: DbExecutor): AutomationExecutionRepository {
  const { automationExecution } = schema;
  return {
    async claim(execution) {
      const rows = await db.insert(automationExecution).values(execution).onConflictDoNothing().returning({ id: automationExecution.id });
      return rows.length > 0;
    },
    async listByRule(organizationId, ruleId, applicationIds) {
      if (applicationIds.length === 0) return [];
      return db
        .select()
        .from(automationExecution)
        .where(
          and(
            eq(automationExecution.organizationId, organizationId),
            eq(automationExecution.ruleId, ruleId),
            inArray(automationExecution.applicationId, [...applicationIds]),
          ),
        );
    },
  };
}
