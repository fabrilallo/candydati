import { desc, eq, schema } from '@candydati/db';
import { privacyNoticeInputSchema, type PrivacyNotice } from '@candydati/domain';
import type { PrivacyNoticeRepository } from '../candidate-ports.js';
import { ConflictError } from '../errors.js';
import { isUniqueViolation, type DbExecutor } from './db-executor.js';

type Row = typeof schema.privacyNotice.$inferSelect;

/** jsonb is a boundary: the retention periods are parsed on every read. */
const toNotice = (row: Row): PrivacyNotice => ({
  ...privacyNoticeInputSchema.parse({
    language: row.language,
    text: row.text,
    contactEmail: row.contactEmail,
    retentionDays: row.retentionDays,
  }),
  id: row.id,
  organizationId: row.organizationId,
  version: row.version,
  createdBy: row.createdBy,
  createdAt: row.createdAt,
});

/** Postgres implementation. Rows are only ever inserted. */
export function createDrizzlePrivacyNotices(db: DbExecutor): PrivacyNoticeRepository {
  const { privacyNotice } = schema;
  return {
    async create(notice) {
      try {
        const [row] = await db.insert(privacyNotice).values(notice).returning();
        if (!row) throw new Error('privacy_notice insert returned no row');
        return toNotice(row);
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError('This privacy notice version already exists.');
        throw error;
      }
    },
    async findActive(organizationId) {
      const [row] = await db
        .select()
        .from(privacyNotice)
        .where(eq(privacyNotice.organizationId, organizationId))
        .orderBy(desc(privacyNotice.version))
        .limit(1);
      return row ? toNotice(row) : null;
    },
    async list(organizationId) {
      const rows = await db
        .select()
        .from(privacyNotice)
        .where(eq(privacyNotice.organizationId, organizationId))
        .orderBy(desc(privacyNotice.version));
      return rows.map(toNotice);
    },
  };
}
