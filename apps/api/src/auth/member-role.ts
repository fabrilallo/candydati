import { and, eq, schema, type Db } from '@candydati/db';

/** Raw role of a user in an organization, or null when they are not a member. */
export async function findMemberRole(db: Db, userId: string, organizationId: string): Promise<string | null> {
  const [row] = await db
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(and(eq(schema.member.userId, userId), eq(schema.member.organizationId, organizationId)))
    .limit(1);
  return row?.role ?? null;
}
