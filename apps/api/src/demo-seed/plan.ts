import { ROW_KEYS, ROW_TABLES, type CvFile, type DemoDataset, type DemoRows, type RowTable } from './dataset.js';

/** What the database already holds of the demo: the keys (`ROW_KEYS`) found per table. */
export type ExistingKeys = { readonly [T in RowTable]: ReadonlySet<string> };

export interface TableCount {
  readonly create: number;
  readonly existing: number;
}

/** The one-row-per-organization things the seed sets: what happens to each. */
export interface SingletonPlan {
  readonly privacyNotice: 'create' | 'keep';
  readonly careersPage: 'create' | 'replace' | 'unchanged';
  readonly agency: 'enable' | 'unchanged';
}

export interface SeedPlan {
  /** Only the rows still missing: a rerun inserts nothing that is already there. */
  readonly rows: DemoRows;
  /** CVs of the applications still to create. */
  readonly cvFiles: readonly CvFile[];
  readonly counts: { readonly [T in RowTable]: TableCount };
  readonly singletons: SingletonPlan;
}

const missing = <T extends RowTable>(rows: DemoRows, table: T, existing: ExistingKeys): DemoRows[T] =>
  (rows[table] as readonly DemoRows[T][number][]).filter((row) => !existing[table].has(ROW_KEYS[table](row as never))) as unknown as DemoRows[T];

/** Pure: the dataset minus what already exists, with the counts to print before anything is written. */
export function planSeed(dataset: DemoDataset, existing: ExistingKeys, singletons: SingletonPlan): SeedPlan {
  const rows = Object.fromEntries(ROW_TABLES.map((table) => [table, missing(dataset.rows, table, existing)])) as unknown as DemoRows;
  const counts = Object.fromEntries(
    ROW_TABLES.map((table) => [table, { create: rows[table].length, existing: dataset.rows[table].length - rows[table].length }]),
  ) as unknown as SeedPlan['counts'];
  const newApplications = new Set(rows.applications.map((row) => row.id));
  return { rows, cvFiles: dataset.cvFiles.filter((file) => newApplications.has(file.applicationId)), counts, singletons };
}

/** True when the plan writes nothing at all. */
export const isNoop = (plan: SeedPlan): boolean =>
  ROW_TABLES.every((table) => plan.counts[table].create === 0) &&
  plan.singletons.privacyNotice === 'keep' &&
  plan.singletons.careersPage === 'unchanged' &&
  plan.singletons.agency === 'unchanged';

const LABELS: { readonly [T in RowTable]: string } = {
  jobs: 'job ads',
  jobTeam: 'job team members',
  restrictions: 'restricted stages',
  criteria: 'scorecard criteria',
  interviewers: 'stage interviewers',
  templates: 'email templates',
  automations: 'automation rules',
  clients: 'clients',
  jobClients: 'client jobs',
  candidates: 'candidates',
  applications: 'applications (with a generated CV each)',
  extractions: 'CV extractions (precomputed)',
  stageEvents: 'stage history events',
  promises: 'response promises',
  notes: 'notes',
  feedbackRequests: 'feedback requests',
  feedbacks: 'interview feedback',
  shortlists: 'client shortlists',
  shortlistItems: 'shortlisted applications',
  tasks: 'tasks',
};

const SINGLETON_LINES: { readonly [K in keyof SingletonPlan]: Readonly<Record<SingletonPlan[K], string>> } = {
  privacyNotice: { create: 'privacy notice: create a demo notice (version 1)', keep: 'privacy notice: keep the active one' },
  careersPage: { create: 'careers page: create and publish the demo page', replace: 'careers page: REPLACE the draft and the published page with the demo page', unchanged: 'careers page: already the demo page' },
  agency: { enable: 'recruiting for clients: turn on', unchanged: 'recruiting for clients: already on' },
};

/** The plan as lines a person reads before saying yes. */
export function describePlan(plan: SeedPlan, organization: { readonly name: string; readonly slug: string }): readonly string[] {
  return [
    `Demo seed for organization "${organization.name}" (${organization.slug}):`,
    ...ROW_TABLES.map((table) => `  ${LABELS[table]}: ${plan.counts[table].create} to create, ${plan.counts[table].existing} already there`),
    ...(Object.keys(SINGLETON_LINES) as (keyof SingletonPlan)[]).map((key) => `  ${(SINGLETON_LINES[key] as Readonly<Record<string, string>>)[plan.singletons[key]]}`),
  ];
}
