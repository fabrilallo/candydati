import { and, eq, inArray, ne, schema, sql, type Db } from '@candydati/db';
import { keysOf, ROW_TABLES, type DemoDataset, type RowTable } from '../dataset.js';
import type { ExistingKeys } from '../plan.js';
import { DemoSeedError } from './target.js';

const { job, jobTeamMember, jobStageRestriction, jobClient, cvExtraction } = schema;

/** Tables whose key is a single `id` column, with that column. */
const ID_TABLES = {
  jobs: schema.job,
  criteria: schema.jobScorecardCriterion,
  interviewers: schema.jobStageInterviewer,
  templates: schema.emailTemplate,
  automations: schema.automationRule,
  clients: schema.client,
  candidates: schema.candidate,
  applications: schema.application,
  stageEvents: schema.applicationStageEvent,
  promises: schema.responsePromise,
  notes: schema.candidateNote,
  feedbackRequests: schema.feedbackRequest,
  feedbacks: schema.interviewFeedback,
  shortlists: schema.clientShortlist,
  shortlistItems: schema.clientShortlistItem,
  tasks: schema.task,
} as const;
type IdTable = keyof typeof ID_TABLES;

const isIdTable = (table: RowTable): table is IdTable => table in ID_TABLES;

async function idKeys(db: Db, organizationId: string, table: IdTable, keys: readonly string[]): Promise<readonly string[]> {
  if (keys.length === 0) return [];
  const target = ID_TABLES[table];
  const rows = await db.select({ id: target.id }).from(target).where(and(eq(target.organizationId, organizationId), inArray(target.id, [...keys])));
  return rows.map((row) => row.id);
}

/** Tables keyed by something else than an id: looked up by the demo jobs or applications they belong to. */
async function otherKeys(db: Db, organizationId: string, table: Exclude<RowTable, IdTable>, dataset: DemoDataset): Promise<readonly string[]> {
  const jobIds = [...keysOf(dataset.rows, 'jobs')];
  if (table === 'jobTeam') {
    const rows = await db.select({ jobId: jobTeamMember.jobId, userId: jobTeamMember.userId }).from(jobTeamMember).where(and(eq(jobTeamMember.organizationId, organizationId), inArray(jobTeamMember.jobId, jobIds)));
    return rows.map((row) => `${row.jobId}:${row.userId}`);
  }
  if (table === 'restrictions') {
    const rows = await db.select({ jobId: jobStageRestriction.jobId, stageId: jobStageRestriction.stageId }).from(jobStageRestriction).where(and(eq(jobStageRestriction.organizationId, organizationId), inArray(jobStageRestriction.jobId, jobIds)));
    return rows.map((row) => `${row.jobId}:${row.stageId}`);
  }
  if (table === 'jobClients') {
    const rows = await db.select({ jobId: jobClient.jobId }).from(jobClient).where(and(eq(jobClient.organizationId, organizationId), inArray(jobClient.jobId, jobIds)));
    return rows.map((row) => row.jobId);
  }
  const applicationIds = [...keysOf(dataset.rows, 'applications')];
  const rows = await db.select({ id: cvExtraction.applicationId }).from(cvExtraction).where(and(eq(cvExtraction.organizationId, organizationId), inArray(cvExtraction.applicationId, applicationIds)));
  return rows.map((row) => row.id);
}

/** The keys of the demo rows already in the database, table by table, inside the organization only. */
export async function loadExistingKeys(db: Db, organizationId: string, dataset: DemoDataset): Promise<ExistingKeys> {
  const entries = [];
  for (const table of ROW_TABLES) {
    const keys = isIdTable(table) ? await idKeys(db, organizationId, table, keysOf(dataset.rows, table)) : await otherKeys(db, organizationId, table, dataset);
    entries.push([table, new Set(keys)] as const);
  }
  return Object.fromEntries(entries) as unknown as ExistingKeys;
}

/**
 * Rows of the organization that are not the demo's but would collide with it (a candidate's email, a job's slug): the
 * seed stops before writing anything, rather than half-linking someone else's data.
 */
export async function assertNoCollision(db: Db, organizationId: string, dataset: DemoDataset): Promise<void> {
  const { candidate } = schema;
  const emails = dataset.rows.candidates.map((row) => row.email.toLowerCase());
  const candidates = await db.select({ id: candidate.id, email: candidate.email }).from(candidate).where(and(eq(candidate.organizationId, organizationId), inArray(sql`lower(${candidate.email})`, emails)));
  const demoCandidates = new Set(keysOf(dataset.rows, 'candidates'));
  const people = candidates.filter((row) => !demoCandidates.has(row.id));
  if (people.length > 0) throw new DemoSeedError(`Candidates not created by the demo already use ${people.length} of its addresses (for example ${people[0]?.email}). Nothing was written.`);
  for (const row of dataset.rows.jobs) {
    const [other] = await db.select({ id: job.id }).from(job).where(and(eq(job.organizationId, organizationId), eq(job.slug, row.slug), ne(job.id, row.id))).limit(1);
    if (other !== undefined) throw new DemoSeedError(`A job not created by the demo already uses the slug "${row.slug}". Nothing was written.`);
  }
}
