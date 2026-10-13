import type { ProcessingRecord, RetentionOverview } from '@tt/core';
import type { DataExport, RetentionRun } from '@tt/domain';

export const toRetentionRunDto = (run: RetentionRun) => ({ id: run.id, startedAt: run.startedAt.toISOString(), warned: run.warned, erased: run.erased });

/** Names are allowed here: it is the controller's own settings screen. `jobTitle` is empty when the job is gone. */
export const toRetentionOverviewDto = (overview: RetentionOverview) => ({
  upcoming: overview.upcoming.map((item) => ({
    applicationId: item.applicationId,
    candidateId: item.candidateId,
    candidateName: item.candidateName,
    jobTitle: item.jobTitle ?? '',
    retentionExpiresAt: item.retentionExpiresAt.toISOString(),
  })),
  lastRuns: overview.lastRuns.map(toRetentionRunDto),
});

export const toDataExportDto = (item: DataExport) => ({
  id: item.id,
  status: item.status,
  sizeBytes: item.sizeBytes,
  createdAt: item.createdAt.toISOString(),
  completedAt: item.completedAt ? item.completedAt.toISOString() : null,
  expiresAt: item.expiresAt.toISOString(),
});

export const toProcessingRecordDto = (record: ProcessingRecord, generatedAt: Date) => ({
  organization: { name: record.organizationName, contactEmail: record.contactEmail },
  privacyNoticeVersion: record.noticeVersion,
  retentionDays: record.retentionDays,
  providers: record.providers,
  generatedAt: generatedAt.toISOString(),
});
