import type { AccessSettingDeps, DrizzleUnitOfWork, JobTeamDeps } from '@tt/core';

export interface TeamWiring {
  /** Job teams: who sees which job's candidates (PRODUCT.md §6). */
  readonly jobTeamDeps: JobTeamDeps;
  /** The organization setting that restricts recruiters to their teams. */
  readonly accessSettingDeps: AccessSettingDeps;
}

export function createTeamDeps(uow: DrizzleUnitOfWork): TeamWiring {
  const r = uow.repositories;
  const core = { auditLog: r.auditLog, transaction: uow.transaction, jobTeams: r.jobTeams };
  const now = () => new Date();
  return {
    jobTeamDeps: { ...core, jobs: r.jobs, stageInterviewers: r.stageInterviewers, members: r.members, now },
    accessSettingDeps: { ...core, organizationSettings: r.organizationSettings, now },
  };
}
