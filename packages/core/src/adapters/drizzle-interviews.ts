import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, ne, schema, sql } from '@candydati/db';
import type { BusyInterval, Interview, InterviewParticipant } from '@candydati/domain';
import { ConflictError } from '../errors.js';
import type { InterviewRepository } from '../interview-ports.js';
import { isUniqueViolation, type DbExecutor } from './db-executor.js';

type Row = typeof schema.interview.$inferSelect;
type PersonRow = typeof schema.interviewInterviewer.$inferSelect;

const toInterview = (row: Row, people: readonly PersonRow[]): Interview => ({
  ...row,
  interviewers: people
    .filter((person) => person.interviewId === row.id)
    .toSorted((a, b) => a.position - b.position)
    .map(({ kind, userId, email, name }): InterviewParticipant => ({ kind, userId, email, name })),
});

/** Postgres implementation. Every statement filters by `organization_id`, except the lookup by the hash of the secret. */
export function createDrizzleInterviews(db: DbExecutor): InterviewRepository {
  const { interview, interviewInterviewer } = schema;
  const withPeople = async (rows: readonly Row[]): Promise<readonly Interview[]> => {
    if (rows.length === 0) return [];
    const people = await db
      .select()
      .from(interviewInterviewer)
      .where(and(eq(interviewInterviewer.organizationId, rows[0]!.organizationId), inArray(interviewInterviewer.interviewId, rows.map((row) => row.id))));
    return rows.map((row) => toInterview(row, people));
  };
  const one = async (rows: readonly Row[]): Promise<Interview | null> => (await withPeople(rows))[0] ?? null;
  return {
    async create(value) {
      const { interviewers, ...row } = value;
      try {
        await db.insert(interview).values(row);
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError('interview_open');
        throw error;
      }
      if (interviewers.length > 0) {
        await db.insert(interviewInterviewer).values(interviewers.map((person, position) => ({ ...person, organizationId: value.organizationId, interviewId: value.id, position })));
      }
      return value;
    },
    findById: async (organizationId, id) => one(await db.select().from(interview).where(and(eq(interview.organizationId, organizationId), eq(interview.id, id))).limit(1)),
    // The secret says which organization the link belongs to; its people are read in that organization.
    findByTokenHash: async (tokenHash) => one(await db.select().from(interview).where(eq(interview.tokenHash, tokenHash)).limit(1)),
    listByApplication: async (organizationId, applicationId) =>
      withPeople(await db.select().from(interview).where(and(eq(interview.organizationId, organizationId), eq(interview.applicationId, applicationId))).orderBy(desc(interview.createdAt), desc(interview.id))),
    async bookedBusy(organizationId, userIds, window, exceptInterviewId) {
      if (userIds.length === 0) return new Map();
      const rows = await db
        .select({ userId: interviewInterviewer.userId, start: interview.startsAt, end: interview.endsAt })
        .from(interview)
        .innerJoin(interviewInterviewer, and(eq(interviewInterviewer.interviewId, interview.id), eq(interviewInterviewer.organizationId, interview.organizationId)))
        .where(
          and(
            eq(interview.organizationId, organizationId),
            eq(interview.status, 'booked'),
            inArray(interviewInterviewer.userId, [...userIds]),
            lt(interview.startsAt, window.to),
            gt(interview.endsAt, window.from),
            ...(exceptInterviewId ? [ne(interview.id, exceptInterviewId)] : []),
          ),
        );
      const result = new Map<string, BusyInterval[]>();
      for (const row of rows) {
        if (row.userId && row.start && row.end) result.set(row.userId, [...(result.get(row.userId) ?? []), { start: row.start, end: row.end }]);
      }
      return result;
    },
    async update(organizationId, id, expected, patch) {
      const rows = await db
        .update(interview)
        .set(patch)
        .where(and(eq(interview.organizationId, organizationId), eq(interview.id, id), inArray(interview.status, [...expected.statuses]), eq(interview.icsSequence, expected.icsSequence)))
        .returning();
      return one(rows);
    },
    async lockPeople(organizationId, userIds) {
      // Sorted, so two bookings sharing people always lock in the same order.
      for (const userId of [...new Set(userIds)].sort()) {
        await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`interview:${organizationId}:${userId}`}, 0))`);
      }
    },
    async listToRemind(window) {
      const rows = await db
        .select()
        .from(interview)
        .where(and(eq(interview.status, 'booked'), isNull(interview.reminderSentAt), gte(interview.startsAt, window.from), lt(interview.startsAt, window.to)))
        .orderBy(asc(interview.startsAt));
      const organizations = [...new Set(rows.map((row) => row.organizationId))];
      const groups = await Promise.all(organizations.map((organizationId) => withPeople(rows.filter((row) => row.organizationId === organizationId))));
      return groups.flat();
    },
  };
}
