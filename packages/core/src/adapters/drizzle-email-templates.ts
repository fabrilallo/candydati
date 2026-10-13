import { and, desc, eq, schema } from '@tt/db';
import type { EmailTemplateRepository } from '../messaging-ports.js';
import { ConflictError } from '../errors.js';
import { isUniqueViolation, type DbExecutor } from './db-executor.js';

/** Postgres implementation. Every statement filters by `organization_id`. */
export function createDrizzleEmailTemplates(db: DbExecutor): EmailTemplateRepository {
  const { emailTemplate } = schema;
  const one = async (where: ReturnType<typeof and>) => (await db.select().from(emailTemplate).where(where).limit(1))[0] ?? null;
  return {
    list: (organizationId) =>
      db.select().from(emailTemplate).where(eq(emailTemplate.organizationId, organizationId)).orderBy(desc(emailTemplate.createdAt), desc(emailTemplate.id)),
    findById: (organizationId, id) => one(and(eq(emailTemplate.organizationId, organizationId), eq(emailTemplate.id, id))),
    findByKind: (organizationId, kind) => one(and(eq(emailTemplate.organizationId, organizationId), eq(emailTemplate.kind, kind))),
    async save(template) {
      const { id: _id, organizationId, ...fields } = template;
      try {
        const [row] = await db
          .insert(emailTemplate)
          .values(template)
          .onConflictDoUpdate({
            target: emailTemplate.id,
            set: fields,
            setWhere: eq(emailTemplate.organizationId, organizationId),
          })
          .returning();
        if (!row) throw new ConflictError('Template id already used.');
        return row;
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError('This kind of template already exists.');
        throw error;
      }
    },
    async delete(organizationId, id) {
      const rows = await db
        .delete(emailTemplate)
        .where(and(eq(emailTemplate.organizationId, organizationId), eq(emailTemplate.id, id)))
        .returning({ id: emailTemplate.id });
      return rows.length > 0;
    },
  };
}
