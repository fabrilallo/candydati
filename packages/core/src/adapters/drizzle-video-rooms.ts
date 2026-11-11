import { and, eq, inArray, schema } from '@candydati/db';
import type { VideoRoomRepository } from '../calendar-ports.js';
import type { DbExecutor } from './db-executor.js';

/** Postgres implementation. Every statement filters by `organization_id`. */
export function createDrizzleVideoRooms(db: DbExecutor): VideoRoomRepository {
  const { videoRoom } = schema;
  const person = (organizationId: string, userId: string) => and(eq(videoRoom.organizationId, organizationId), eq(videoRoom.userId, userId));
  return {
    async find(organizationId, userId) {
      const [row] = await db.select().from(videoRoom).where(person(organizationId, userId)).limit(1);
      return row ?? null;
    },
    async listByUsers(organizationId, userIds) {
      if (userIds.length === 0) return [];
      return db
        .select()
        .from(videoRoom)
        .where(and(eq(videoRoom.organizationId, organizationId), inArray(videoRoom.userId, [...userIds])));
    },
    async save(record) {
      await db
        .insert(videoRoom)
        .values(record)
        .onConflictDoUpdate({ target: [videoRoom.organizationId, videoRoom.userId], set: { url: record.url, updatedAt: record.updatedAt } });
    },
    async remove(organizationId, userId) {
      const rows = await db.delete(videoRoom).where(person(organizationId, userId)).returning({ userId: videoRoom.userId });
      return rows.length > 0;
    },
  };
}
