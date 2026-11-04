import type { JobTeamMember, RestrictedStage } from '@candydati/domain';
import type { OrganizationSettingsRepository } from '../job-request-ports.js';
import type { JobTeamRepository } from '../job-team-ports.js';
import type { CandidateStore } from './in-memory-candidates.js';
import type { FeedbackStore } from './in-memory-feedback.js';
import { cell, type Cell } from './in-memory-transaction.js';

/** Where the in-memory teams read applications, stage interviewers and the recruiter setting from. All optional. */
export interface JobTeamSources {
  readonly store?: CandidateStore | undefined;
  readonly interviewers?: FeedbackStore | undefined;
  readonly settings?: OrganizationSettingsRepository | undefined;
}

export interface InMemoryJobTeams extends JobTeamRepository {
  snapshot(): readonly JobTeamMember[];
  restrictedSnapshot(): readonly RestrictedStage[];
  /** The same team rows, read together with other sources (a world built in steps adds them later). */
  withSources(sources: JobTeamSources): InMemoryJobTeams;
}

const sameRow = (a: JobTeamMember, organizationId: string, jobId: string, userId: string): boolean =>
  a.organizationId === organizationId && a.jobId === jobId && a.userId === userId;

const sameStage = (a: RestrictedStage, organizationId: string, jobId: string, stageId: string): boolean =>
  a.organizationId === organizationId && a.jobId === jobId && a.stageId === stageId;

function build(rows: Cell<readonly JobTeamMember[]>, restricted: Cell<readonly RestrictedStage[]>, sources: JobTeamSources): InMemoryJobTeams {
  const applications = (organizationId: string) => (sources.store?.read().applications ?? []).filter((a) => a.organizationId === organizationId);
  return {
    async jobIdsOf(organizationId, userId) {
      const explicit = rows.get().filter((row) => row.organizationId === organizationId && row.userId === userId).map((row) => row.jobId);
      const interviewing = (sources.interviewers?.read().interviewers ?? [])
        .filter((i) => i.organizationId === organizationId && i.userId === userId)
        .map((i) => i.jobId);
      return [...new Set([...explicit, ...interviewing])];
    },
    async restrictsRecruiters(organizationId) {
      return (await sources.settings?.get(organizationId))?.restrictRecruitersToTeam ?? false;
    },
    async candidatesIn(organizationId, candidateIds, jobIds) {
      const found = applications(organizationId).filter((a) => candidateIds.includes(a.candidateId) && jobIds.includes(a.jobId));
      return [...new Set(found.map((a) => a.candidateId))];
    },
    async applicationsIn(organizationId, applicationIds, jobIds) {
      return applications(organizationId)
        .filter((a) => applicationIds.includes(a.id) && jobIds.includes(a.jobId))
        .map((a) => a.id);
    },
    async list(organizationId, jobId) {
      return rows
        .get()
        .filter((row) => row.organizationId === organizationId && row.jobId === jobId)
        .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
    async upsert(member) {
      const existing = rows.get().find((row) => sameRow(row, member.organizationId, member.jobId, member.userId));
      const stored = existing ? { ...existing, role: member.role } : member;
      rows.set([...rows.get().filter((row) => !sameRow(row, member.organizationId, member.jobId, member.userId)), stored]);
      return stored;
    },
    async addIfAbsent(member) {
      if (!rows.get().some((row) => sameRow(row, member.organizationId, member.jobId, member.userId))) rows.set([...rows.get(), member]);
    },
    async remove(organizationId, jobId, userId) {
      const before = rows.get();
      rows.set(before.filter((row) => !sameRow(row, organizationId, jobId, userId)));
      return rows.get().length !== before.length;
    },
    async listRestrictedStages(organizationId, jobId) {
      return restricted.get().filter((row) => row.organizationId === organizationId && (jobId === undefined || row.jobId === jobId));
    },
    async restrictStage(stage) {
      if (restricted.get().some((row) => sameStage(row, stage.organizationId, stage.jobId, stage.stageId))) return false;
      restricted.set([...restricted.get(), stage]);
      return true;
    },
    async unrestrictStage(organizationId, jobId, stageId) {
      const before = restricted.get();
      restricted.set(before.filter((row) => !sameStage(row, organizationId, jobId, stageId)));
      return restricted.get().length !== before.length;
    },
    snapshot: () => rows.get(),
    restrictedSnapshot: () => restricted.get(),
    withSources: (more) => build(rows, restricted, { ...sources, ...more }),
  };
}

export function createInMemoryJobTeams(initial: readonly JobTeamMember[] = [], sources: JobTeamSources = {}): InMemoryJobTeams {
  return build(cell<readonly JobTeamMember[]>([...initial]), cell<readonly RestrictedStage[]>([]), sources);
}
