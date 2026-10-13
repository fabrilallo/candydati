import { z } from 'zod';

/** How many days before `retention_expires_at` owners and admins are warned. */
export const RETENTION_WARNING_DAYS = 30;
/** An organization export stays downloadable for this many days, then the retention job deletes it. */
export const DATA_EXPORT_TTL_DAYS = 7;

export const ERASURE_REASONS = ['request', 'retention', 'consent_withdrawn'] as const;
export type ErasureReason = (typeof ERASURE_REASONS)[number];

/** One daily run of the retention job for one organization. Counts only. */
export interface RetentionRun {
  readonly id: string;
  readonly organizationId: string;
  readonly startedAt: Date;
  /** Applications warned about in this run (new notifications created). */
  readonly warned: number;
  /** Applications erased in this run. */
  readonly erased: number;
}

export const DATA_EXPORT_STATUSES = ['pending', 'ready', 'failed'] as const;
export type DataExportStatus = (typeof DATA_EXPORT_STATUSES)[number];
export const dataExportStatusSchema = z.enum(DATA_EXPORT_STATUSES);

/** Request of a full organization export. The ZIP lives in storage under `dataExportKey`. */
export interface DataExport {
  readonly id: string;
  readonly organizationId: string;
  readonly requestedBy: string;
  readonly status: DataExportStatus;
  readonly sizeBytes: number | null;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
  readonly expiresAt: Date;
}

export const dataExportKey = (organizationId: string, exportId: string): string => `organizations/${organizationId}/exports/${exportId}.zip`;
