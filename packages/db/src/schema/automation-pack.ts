import type { AutomationActionType, AutomationTriggerType, StageAnchor } from '@candydati/domain';
import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';
import { jobTemplate } from './job.js';

const organizationRef = () =>
  text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'restrict' });

/**
 * A set of rules the organization keeps once and attaches to many jobs. Attaching copies the rules into the job
 * (`automation_rule.pack_id` remembers where they came from); job templates reference packs (`job_template_pack`).
 */
export const automationPack = pgTable(
  'automation_pack',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('automation_pack_org_name_uidx').on(table.organizationId, sql`lower(${table.name})`)],
);

/**
 * A rule of a pack: same shape as `automation_rule`, with `stage_anchor` (`received` or a stage type) instead of a stage
 * id. A `propose_move` keeps a stage type in its `config.toStageId`. Goes with the pack.
 */
export const automationPackRule = pgTable(
  'automation_pack_rule',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    packId: text('pack_id')
      .notNull()
      .references(() => automationPack.id, { onDelete: 'cascade' }),
    stageAnchor: text('stage_anchor').$type<StageAnchor>().notNull(),
    trigger: text('trigger').$type<AutomationTriggerType>().notNull(),
    triggerConfig: jsonb('trigger_config').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    conditions: jsonb('conditions').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    action: text('action').$type<AutomationActionType>().notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('automation_pack_rule_org_pack_idx').on(table.organizationId, table.packId)],
);

/** The packs a job template brings, in order: a job created from the template gets a copy of their rules. */
export const jobTemplatePack = pgTable(
  'job_template_pack',
  {
    organizationId: organizationRef(),
    templateId: text('template_id')
      .notNull()
      .references(() => jobTemplate.id, { onDelete: 'cascade' }),
    packId: text('pack_id')
      .notNull()
      .references(() => automationPack.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
  },
  (table) => [primaryKey({ columns: [table.templateId, table.packId] }), index('job_template_pack_org_pack_idx').on(table.organizationId, table.packId)],
);

export type AutomationPackRow = typeof automationPack.$inferSelect;
export type AutomationPackRuleRow = typeof automationPackRule.$inferSelect;
export type JobTemplatePackRow = typeof jobTemplatePack.$inferSelect;
