import {
  CONNECTOR_MATURITIES,
  MIGRATION_ISSUE_CODES,
  MIGRATION_ISSUE_LEVELS,
  MIGRATION_JOB_STATUSES,
  MIGRATION_STAGE_TARGETS,
  MIGRATION_STATUSES,
  migrationStageChoiceSchema,
  migrationStageNameChoiceSchema,
} from '@candydati/domain';
import { z } from 'zod';

const isoDate = z.iso.datetime();
const int = z.number().int();

const jobCount = z.object({
  jobRef: z.string(),
  title: z.string(),
  status: z.enum(MIGRATION_JOB_STATUSES),
  stages: int,
  applications: int,
  open: int,
  hired: int,
  notSelected: int,
  withdrawn: int,
});

const commitCounts = z.object({
  jobs: int,
  candidatesCreated: int,
  candidatesMerged: int,
  applications: int,
  skippedAlreadyApplied: int,
  cvs: int,
  filesSkipped: int,
  stageEvents: int,
  notes: int,
  messages: int,
  reconfirmationsQueued: int,
});

const undoCounts = z.object({
  applicationsErased: int,
  candidatesErased: int,
  keptReconfirmed: int,
  keptAppliedAgain: int,
  jobsDeleted: int,
  jobsKept: int,
  historyDeleted: int,
  failed: int,
});

const counts = z.object({
  jobs: int,
  candidates: int,
  applications: int,
  notes: int,
  messages: int,
  files: int,
  merged: int,
  consentGiven: int,
  consentToRenew: int,
  consentExpired: int,
  excludedApplications: int,
  excludedNotes: int,
  excludedMessages: int,
  excludedFiles: int,
  issueErrors: int,
  issueWarnings: int,
  issueInfos: int,
  perJob: z.array(jobCount),
  commit: commitCounts.optional(),
  undo: undoCounts.optional(),
}).partial();

const stageMappingEntry = z.object({
  jobRef: z.string(),
  stageRef: z.string(),
  sourceName: z.string().describe('The stage name in the package, as it was.'),
  type: z.enum(MIGRATION_STAGE_TARGETS).describe('`other` still has to be chosen; `received` lands in the first column of the job.'),
  title: z.string(),
});

export const migrationBatchSchema = z.object({
  id: z.string(),
  status: z.enum(MIGRATION_STATUSES),
  sourceSystem: z.string(),
  producer: z.string(),
  connectorMaturity: z.enum(CONNECTOR_MATURITIES),
  counts,
  stageMapping: z.array(stageMappingEntry),
  excludedJobs: z.array(z.string()),
  declarations: z.object({ at: isoDate, controller: z.literal(true), previewChecked: z.literal(true), processorsOwned: z.literal(true) }).nullable(),
  error: z.string().nullable().describe('A short reason code when the batch failed.'),
  createdAt: isoDate,
  updatedAt: isoDate,
  committedAt: isoDate.nullable(),
  undoneAt: isoDate.nullable(),
  purgedAt: isoDate.nullable().describe('When the package file and the findings were deleted: the preview is gone after that.'),
});

export const migrationIssueSchema = z.object({
  id: z.string(),
  level: z.enum(MIGRATION_ISSUE_LEVELS),
  code: z.enum(MIGRATION_ISSUE_CODES),
  ref: z.string().nullable().describe('The package ref the finding is about (candidate, application, `job/stage`, file path).'),
  detail: z.string().nullable().describe('A date, a size, a stage name or a count; never personal data.'),
});

export const migrationIssuesPageSchema = z.object({
  items: z.array(migrationIssueSchema),
  total: int.describe('Findings matching the filter, across pages.'),
  page: int,
  limit: int,
});

export const undoMigrationSchema = z.object({ batch: migrationBatchSchema, counts: undoCounts });

export const migrationUploadBody = z.object({ file: z.string().meta({ format: 'binary' }) });

export const migrationChoicesBody = z.object({
  stageMapping: z.array(migrationStageChoiceSchema).optional().describe('Where single stages land.'),
  stageNames: z.array(migrationStageNameChoiceSchema).optional().describe('The same choice for every stage with this source name, in every job.'),
  excludedJobs: z.array(z.string()).optional().describe('Replaces the list of package jobs left out.'),
  includeExpired: z.literal(false).optional().describe('People whose retention expired never come across: only `false` is accepted.'),
});

export const migrationCommitBody = z.object({
  declarations: z.object({ controller: z.literal(true), previewChecked: z.literal(true), processorsOwned: z.literal(true) }),
});
