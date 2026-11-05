import { sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';

const organizationRef = () =>
  text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'restrict' });

/**
 * An alias an organization added to the built-in skill dictionary (ADR 0010): `alias` is another way of writing `skill`
 * (a built-in skill's name, or the organization's own skill). `alias_key` is `normalizeSkill(alias)`, computed in code:
 * unique per organization, so a written form belongs to one skill only.
 */
export const skillAlias = pgTable(
  'skill_alias',
  {
    id: text('id').primaryKey(),
    organizationId: organizationRef(),
    skill: text('skill').notNull(),
    alias: text('alias').notNull(),
    aliasKey: text('alias_key').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('skill_alias_org_key_uidx').on(table.organizationId, table.aliasKey),
    index('skill_alias_org_idx').on(table.organizationId),
    check('skill_alias_text_check', sql`char_length(${table.skill}) between 1 and 60 and char_length(${table.alias}) between 1 and 60 and char_length(${table.aliasKey}) between 1 and 60`),
  ],
);

/** A built-in alias an organization switched off, by `normalizeSkill` key. Removing the row switches it on again. */
export const skillAliasDisabled = pgTable(
  'skill_alias_disabled',
  {
    organizationId: organizationRef(),
    aliasKey: text('alias_key').notNull(),
    disabledBy: text('disabled_by').notNull(),
    disabledAt: timestamp('disabled_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.aliasKey] }), check('skill_alias_disabled_key_check', sql`char_length(${table.aliasKey}) between 1 and 60`)],
);

export type SkillAliasRow = typeof skillAlias.$inferSelect;
