import type { DrizzleUnitOfWork, SetupProgressDeps } from '@candydati/core';

/** The setup checklist reads job counts, the active notice, the careers page and the member list of the organization. */
export function createSetupProgressDeps(uow: DrizzleUnitOfWork): SetupProgressDeps {
  const r = uow.repositories;
  return {
    auditLog: r.auditLog,
    transaction: uow.transaction,
    jobTeams: r.jobTeams,
    privacyNotices: r.privacyNotices,
    careersPages: r.careersPages,
    jobCounts: r.jobs,
    members: r.members,
  };
}
