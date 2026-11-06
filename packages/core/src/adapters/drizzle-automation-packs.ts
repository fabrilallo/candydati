import { and, asc, count, eq, schema, sql } from '@candydati/db';
import { automationActionSchema, automationConditionsSchema, automationTriggerSchema, stageAnchorSchema, type AutomationPack, type AutomationPackRule } from '@candydati/domain';
import type { AutomationPackRepository, JobTemplatePackRepository } from '../pack-ports.js';
import type { DbExecutor } from './db-executor.js';

type PackRow = typeof schema.automationPack.$inferSelect;
type RuleRow = typeof schema.automationPackRule.$inferSelect;

const toPack = (row: PackRow): AutomationPack => ({ ...row });

/** jsonb columns and the anchor are a boundary: a row that no longer parses is a corrupted rule, never copied. */
const toRule = (row: RuleRow): AutomationPackRule => ({
  id: row.id,
  organizationId: row.organizationId,
  packId: row.packId,
  stage: stageAnchorSchema.parse(row.stageAnchor),
  trigger: automationTriggerSchema.parse({ ...row.triggerConfig, type: row.trigger }),
  conditions: automationConditionsSchema.parse(row.conditions),
  action: automationActionSchema.parse({ ...row.config, type: row.action }),
  enabled: row.enabled,
  createdBy: row.createdBy,
  createdAt: row.createdAt,
});

const toRuleValues = (rule: AutomationPackRule) => {
  const { type, ...config } = rule.action;
  const { type: trigger, ...triggerConfig } = rule.trigger;
  const { stage, ...rest } = rule;
  return { ...rest, stageAnchor: stage, trigger, triggerConfig, conditions: { ...rule.conditions }, action: type, config };
};

/** Postgres implementation. Every statement filters by `organization_id`. */
export function createDrizzleAutomationPacks(db: DbExecutor): AutomationPackRepository {
  const { automationPack: packs, automationPackRule: rules } = schema;
  const packIn = (organizationId: string, id: string) => and(eq(packs.organizationId, organizationId), eq(packs.id, id));
  const ruleIn = (organizationId: string, id: string) => and(eq(rules.organizationId, organizationId), eq(rules.id, id));
  return {
    async create(pack) {
      const [row] = await db.insert(packs).values(pack).returning();
      if (!row) throw new Error('automation pack insert returned no row');
      return toPack(row);
    },
    async save(pack) {
      const [row] = await db
        .update(packs)
        .set({ name: pack.name, description: pack.description, updatedAt: pack.updatedAt })
        .where(packIn(pack.organizationId, pack.id))
        .returning();
      if (!row) throw new Error('automation pack not found for save');
      return toPack(row);
    },
    async findById(organizationId, id) {
      const [row] = await db.select().from(packs).where(packIn(organizationId, id)).limit(1);
      return row ? toPack(row) : null;
    },
    async findByName(organizationId, name) {
      const [row] = await db
        .select()
        .from(packs)
        .where(and(eq(packs.organizationId, organizationId), sql`lower(${packs.name}) = lower(${name})`))
        .limit(1);
      return row ? toPack(row) : null;
    },
    async list(organizationId) {
      const rows = await db.select().from(packs).where(eq(packs.organizationId, organizationId)).orderBy(asc(sql`lower(${packs.name})`), asc(packs.id));
      return rows.map(toPack);
    },
    async delete(organizationId, id) {
      const rows = await db.delete(packs).where(packIn(organizationId, id)).returning({ id: packs.id });
      return rows.length > 0;
    },
    async countRules(organizationId) {
      const rows = await db.select({ packId: rules.packId, n: count() }).from(rules).where(eq(rules.organizationId, organizationId)).groupBy(rules.packId);
      return Object.fromEntries(rows.map((row) => [row.packId, Number(row.n)]));
    },
    async createRule(rule) {
      const [row] = await db.insert(rules).values(toRuleValues(rule)).returning();
      if (!row) throw new Error('automation pack rule insert returned no row');
      return toRule(row);
    },
    async saveRule(rule) {
      const { id, organizationId, packId: _packId, createdBy: _createdBy, createdAt: _createdAt, ...values } = toRuleValues(rule);
      const [row] = await db.update(rules).set(values).where(ruleIn(organizationId, id)).returning();
      if (!row) throw new Error('automation pack rule not found for save');
      return toRule(row);
    },
    async findRule(organizationId, id) {
      const [row] = await db.select().from(rules).where(ruleIn(organizationId, id)).limit(1);
      return row ? toRule(row) : null;
    },
    async listRules(organizationId, packId) {
      const rows = await db
        .select()
        .from(rules)
        .where(and(eq(rules.organizationId, organizationId), eq(rules.packId, packId)))
        .orderBy(asc(rules.createdAt), asc(rules.id));
      return rows.map(toRule);
    },
    async deleteRule(organizationId, id) {
      const rows = await db.delete(rules).where(ruleIn(organizationId, id)).returning({ id: rules.id });
      return rows.length > 0;
    },
  };
}

export function createDrizzleJobTemplatePacks(db: DbExecutor): JobTemplatePackRepository {
  const { jobTemplatePack: links } = schema;
  return {
    async listByTemplate(organizationId, templateId) {
      const rows = await db
        .select({ packId: links.packId })
        .from(links)
        .where(and(eq(links.organizationId, organizationId), eq(links.templateId, templateId)))
        .orderBy(asc(links.position));
      return rows.map((row) => row.packId);
    },
    async templatesByPack(organizationId) {
      const rows = await db.select({ packId: links.packId, templateId: links.templateId }).from(links).where(eq(links.organizationId, organizationId));
      return rows.reduce<Record<string, readonly string[]>>((byPack, row) => ({ ...byPack, [row.packId]: [...(byPack[row.packId] ?? []), row.templateId] }), {});
    },
    async replace(organizationId, templateId, packIds) {
      await db.delete(links).where(and(eq(links.organizationId, organizationId), eq(links.templateId, templateId)));
      if (packIds.length > 0) await db.insert(links).values(packIds.map((packId, position) => ({ organizationId, templateId, packId, position })));
    },
  };
}
