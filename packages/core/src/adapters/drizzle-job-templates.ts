import { and, desc, eq, schema } from '@candydati/db';
import type { DbExecutor } from './db-executor.js';
import { jobContentSchema, type JobTemplate } from '@candydati/domain';
import type { JobTemplateRepository } from '../job-ports.js';

type Row = typeof schema.jobTemplate.$inferSelect;

const toTemplate = (row: Row): JobTemplate => ({
  id: row.id,
  organizationId: row.organizationId,
  name: row.name,
  content: jobContentSchema.parse(row.content),
  createdBy: row.createdBy,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** Postgres implementation. Every statement filters by `organization_id`. */
export function createDrizzleJobTemplates(db: DbExecutor): JobTemplateRepository {
  const { jobTemplate } = schema;
  const scoped = (organizationId: string, id: string) =>
    and(eq(jobTemplate.organizationId, organizationId), eq(jobTemplate.id, id));
  return {
    async create(template) {
      const [row] = await db.insert(jobTemplate).values(template).returning();
      if (!row) throw new Error('job_template insert returned no row');
      return toTemplate(row);
    },
    async list(organizationId) {
      const rows = await db
        .select()
        .from(jobTemplate)
        .where(eq(jobTemplate.organizationId, organizationId))
        .orderBy(desc(jobTemplate.updatedAt), desc(jobTemplate.id));
      return rows.map(toTemplate);
    },
    async findById(organizationId, id) {
      const [row] = await db.select().from(jobTemplate).where(scoped(organizationId, id)).limit(1);
      return row ? toTemplate(row) : null;
    },
    async delete(organizationId, id) {
      const rows = await db.delete(jobTemplate).where(scoped(organizationId, id)).returning({ id: jobTemplate.id });
      return rows.length > 0;
    },
  };
}
