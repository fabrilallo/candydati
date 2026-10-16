import type { DistributionStatus } from '@candydati/domain';
import { index, boolean, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { organization } from './auth.js';
import { job } from './job.js';

/**
 * State of one ad on one registered channel (the built-in XML feed is computed, never stored). One row per
 * (organization, job, channel), replaced on each sync.
 */
export const jobDistribution = pgTable(
  'job_distribution',
  {
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    jobId: text('job_id')
      .notNull()
      .references(() => job.id, { onDelete: 'restrict' }),
    channelId: text('channel_id').notNull(),
    status: text('status').$type<DistributionStatus>().notNull(),
    externalId: text('external_id'),
    url: text('url'),
    /** A short reason, never a response body. */
    error: text('error'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.jobId, table.channelId] }),
    index('job_distribution_org_channel_idx').on(table.organizationId, table.channelId),
  ],
);

/** Per-organization switch of a registered channel. No row: enabled. */
export const distributionSetting = pgTable(
  'distribution_setting',
  {
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    channelId: text('channel_id').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.channelId] })],
);

export type JobDistributionRow = typeof jobDistribution.$inferSelect;
export type DistributionSettingRow = typeof distributionSetting.$inferSelect;
