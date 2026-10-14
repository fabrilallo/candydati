import { and, asc, eq, inArray, isNotNull, schema } from '@tt/db';
import { JOB_TEAM_ROLES, type JobTeamMember, type JobTeamRole } from '@tt/domain';
import type { JobTeamRepository } from '../job-team-ports.js';
import type { DbExecutor } from './db-executor.js';

type Row = typeof schema.jobTeamMember.$inferSelect;

/** The role column is free text: it is checked on read, so a corrupted row fails loudly. */
const toRole = (value: string): JobTeamRole => {
  const found = JOB_TEAM_ROLES.find((role) => role === value);
  if (!found) throw new Error(`Unexpected job team role in database: ${value}`);
  return found;
};

const toMember = (row: Row): JobTeamMember => ({
  organizationId: row.organizationId,
  jobId: row.jobId,
  userId: row.userId,
  role: toRole(row.role),
  addedBy: row.addedBy,
  createdAt: row.createdAt,
});

/** Postgres implementation. Every statement filters by `organization_id`. */
export function createDrizzleJobTeams(db: DbExecutor): JobTeamRepository {
  const { jobTeamMember: team, jobStageInterviewer: interviewer, application, organizationSetting: setting } = schema;
  const key = (organizationId: string, jobId: string, userId: string) =>
    and(eq(team.organizationId, organizationId), eq(team.jobId, jobId), eq(team.userId, userId));
  return {
    async jobIdsOf(organizationId, userId) {
      const [members, interviews] = [
        await db.select({ jobId: team.jobId }).from(team).where(and(eq(team.organizationId, organizationId), eq(team.userId, userId))),
        await db
          .select({ jobId: interviewer.jobId })
          .from(interviewer)
          .where(and(eq(interviewer.organizationId, organizationId), eq(interviewer.userId, userId), isNotNull(interviewer.userId))),
      ];
      return [...new Set([...members, ...interviews].map((row) => row.jobId))];
    },
    async restrictsRecruiters(organizationId) {
      const [row] = await db.select({ value: setting.restrictRecruitersToTeam }).from(setting).where(eq(setting.organizationId, organizationId)).limit(1);
      return row?.value ?? false;
    },
    async candidatesIn(organizationId, candidateIds, jobIds) {
      if (candidateIds.length === 0 || jobIds.length === 0) return [];
      const rows = await db
        .select({ id: application.candidateId })
        .from(application)
        .where(and(eq(application.organizationId, organizationId), inArray(application.candidateId, [...candidateIds]), inArray(application.jobId, [...jobIds])));
      return [...new Set(rows.map((row) => row.id))];
    },
    async applicationsIn(organizationId, applicationIds, jobIds) {
      if (applicationIds.length === 0 || jobIds.length === 0) return [];
      const rows = await db
        .select({ id: application.id })
        .from(application)
        .where(and(eq(application.organizationId, organizationId), inArray(application.id, [...applicationIds]), inArray(application.jobId, [...jobIds])));
      return rows.map((row) => row.id);
    },
    async list(organizationId, jobId) {
      const rows = await db
        .select()
        .from(team)
        .where(and(eq(team.organizationId, organizationId), eq(team.jobId, jobId)))
        .orderBy(asc(team.createdAt), asc(team.userId));
      return rows.map(toMember);
    },
    async upsert(member) {
      const [row] = await db
        .insert(team)
        .values(member)
        .onConflictDoUpdate({ target: [team.organizationId, team.jobId, team.userId], set: { role: member.role } })
        .returning();
      if (!row) throw new Error('job team upsert returned no row');
      return toMember(row);
    },
    async addIfAbsent(member) {
      await db.insert(team).values(member).onConflictDoNothing();
    },
    async remove(organizationId, jobId, userId) {
      const rows = await db.delete(team).where(key(organizationId, jobId, userId)).returning({ userId: team.userId });
      return rows.length > 0;
    },
  };
}
