import type { schema } from '@candydati/db';
import type { CareersPageDocument, PrivacyNotice } from '@candydati/domain';

/** Who and when the demo is built for. Everything the builders need from outside, so they stay pure. */
export interface DemoContext {
  readonly organizationId: string;
  /** The member the demo acts as: author of jobs, notes and tasks, interviewer of some stages. */
  readonly owner: { readonly id: string; readonly name: string; readonly email: string };
  /** The active privacy notice the demo applications consent to. */
  readonly notice: Pick<PrivacyNotice, 'id' | 'version' | 'retentionDays'>;
  readonly now: Date;
  /** A random hex secret for the hash of link tokens (feedback, shortlist): never derivable from the ids. */
  readonly secret: () => string;
}

/**
 * Tables the seed inserts rows into, in dependency order (parents first). Every row carries the organization id.
 * The careers page and the organization settings are written separately: one row per organization, replaced.
 */
export const ROW_TABLES = [
  'jobs',
  'jobTeam',
  'restrictions',
  'criteria',
  'interviewers',
  'templates',
  'automations',
  'clients',
  'jobClients',
  'candidates',
  'applications',
  'extractions',
  'stageEvents',
  'promises',
  'notes',
  'feedbackRequests',
  'feedbacks',
  'shortlists',
  'shortlistItems',
  'tasks',
] as const;
export type RowTable = (typeof ROW_TABLES)[number];

export interface DemoRows {
  readonly jobs: readonly (typeof schema.job.$inferInsert)[];
  readonly jobTeam: readonly (typeof schema.jobTeamMember.$inferInsert)[];
  readonly restrictions: readonly (typeof schema.jobStageRestriction.$inferInsert)[];
  readonly criteria: readonly (typeof schema.jobScorecardCriterion.$inferInsert)[];
  readonly interviewers: readonly (typeof schema.jobStageInterviewer.$inferInsert)[];
  readonly templates: readonly (typeof schema.emailTemplate.$inferInsert)[];
  readonly automations: readonly (typeof schema.automationRule.$inferInsert)[];
  readonly clients: readonly (typeof schema.client.$inferInsert)[];
  readonly jobClients: readonly (typeof schema.jobClient.$inferInsert)[];
  readonly candidates: readonly (typeof schema.candidate.$inferInsert)[];
  readonly applications: readonly (typeof schema.application.$inferInsert)[];
  readonly extractions: readonly (typeof schema.cvExtraction.$inferInsert)[];
  readonly stageEvents: readonly (typeof schema.applicationStageEvent.$inferInsert)[];
  readonly promises: readonly (typeof schema.responsePromise.$inferInsert)[];
  readonly notes: readonly (typeof schema.candidateNote.$inferInsert)[];
  readonly feedbackRequests: readonly (typeof schema.feedbackRequest.$inferInsert)[];
  readonly feedbacks: readonly (typeof schema.interviewFeedback.$inferInsert)[];
  readonly shortlists: readonly (typeof schema.clientShortlist.$inferInsert)[];
  readonly shortlistItems: readonly (typeof schema.clientShortlistItem.$inferInsert)[];
  readonly tasks: readonly (typeof schema.task.$inferInsert)[];
}

/** A generated CV to store before the rows that point at it. */
export interface CvFile {
  readonly applicationId: string;
  readonly key: string;
  readonly bytes: Uint8Array;
}

export interface DemoDataset {
  readonly rows: DemoRows;
  readonly cvFiles: readonly CvFile[];
  readonly careersPage: CareersPageDocument;
}

type RowOf<T extends RowTable> = DemoRows[T][number];

/**
 * The identity of a row inside the organization: the primary key, or the natural key of the tables that have no id.
 * The plan compares these with what the database already holds.
 */
export const ROW_KEYS: { readonly [T in RowTable]: (row: RowOf<T>) => string } = {
  jobs: (row) => row.id,
  jobTeam: (row) => `${row.jobId}:${row.userId}`,
  restrictions: (row) => `${row.jobId}:${row.stageId}`,
  criteria: (row) => row.id,
  interviewers: (row) => row.id,
  templates: (row) => row.id,
  automations: (row) => row.id,
  clients: (row) => row.id,
  jobClients: (row) => row.jobId,
  candidates: (row) => row.id,
  applications: (row) => row.id,
  extractions: (row) => row.applicationId,
  stageEvents: (row) => row.id,
  promises: (row) => row.id,
  notes: (row) => row.id,
  feedbackRequests: (row) => row.id,
  feedbacks: (row) => row.id,
  shortlists: (row) => row.id,
  shortlistItems: (row) => row.id,
  tasks: (row) => row.id,
};

export const keysOf = <T extends RowTable>(rows: DemoRows, table: T): readonly string[] =>
  (rows[table] as readonly RowOf<T>[]).map((row) => ROW_KEYS[table](row));
