import { z } from 'zod';
import { MESSAGE_DIRECTIONS } from '../messaging/message.js';
import { CONSENT_SCOPES } from '../candidate/privacy.js';
import { OUTCOMES, TAG_MAX, TAGS_PER_CANDIDATE_MAX } from '../candidate/application.js';
import { personNameSchema } from '../candidate/person-name.js';
import { IMPORT_NOTE_MAX } from '../import/import.js';
import { JOB_TITLE_MAX, STAGE_TITLE_MAX, jobContentSchema } from '../job/content.js';
import { STAGE_TYPES } from '../job/taxonomy.js';
import { ORIGIN_MAX } from '../report/origin.js';
import { httpUrlSchema } from '../url/http-url.js';
import {
  MIGRATION_FILE_KINDS,
  MIGRATION_JOB_STATUSES,
  MIGRATION_LIMITS,
  MIGRATION_PACKAGE_FORMAT,
  MIGRATION_PACKAGE_SCHEMA_ID,
} from './constants.js';
import { checkMigrationReferences } from './references.js';

export * from './constants.js';

const TEXT_MAX = 20_000;
const MESSAGE_TEXT_MAX = 50_000;

const date = z.iso.datetime({ offset: true });
const ref = z.string().min(1).max(120);
const text = (max: number) => z.string().trim().min(1).max(max);
const email = z.email().max(254);

const sourceSchema = z.strictObject({
  /** The previous ATS, e.g. `teamtailor`, `workable`, or a free name. */
  system: text(60),
  exportedAt: date,
  /** Who built the package, e.g. `connector:teamtailor@1` or `skill:candydati-migration@1`. */
  producer: text(120),
});

/** Signs notes only; never creates accounts. Matched to members by email when the migration is committed. */
const userSchema = z.strictObject({ ref, name: text(120), email: email.optional() });

const stageSchema = z.strictObject({ ref, name: text(STAGE_TITLE_MAX), type: z.enum(STAGE_TYPES).optional() });

/** The job's title and its stages live on the job itself, so the content cannot contradict them. */
const jobContentPartialSchema = jobContentSchema.omit({ title: true, process: true }).partial().strict();

const jobSchema = z.strictObject({
  ref,
  title: text(JOB_TITLE_MAX),
  status: z.enum(MIGRATION_JOB_STATUSES),
  createdAt: date,
  closedAt: date.optional(),
  content: jobContentPartialSchema.optional(),
  stages: z.array(stageSchema).max(MIGRATION_LIMITS.stagesPerJob).default([]),
});

const consentSchema = z.strictObject({
  givenAt: date,
  expiresAt: date.optional(),
  scopes: z.array(z.enum(CONSENT_SCOPES)).max(CONSENT_SCOPES.length).optional(),
});

const candidateSchema = z.strictObject({
  ref,
  firstName: personNameSchema,
  lastName: personNameSchema,
  email: email.optional(),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{6,20}$/, 'phone').optional(),
  linkedinUrl: httpUrlSchema.max(300).optional(),
  tags: z.array(text(TAG_MAX)).max(TAGS_PER_CANDIDATE_MAX).default([]),
  createdAt: date,
  /** Absent: the person gets the reconfirmation of imported data (ADR 0008). */
  consent: consentSchema.optional(),
});

const fileSchema = z.strictObject({
  path: z.string().min(1).max(500),
  kind: z.enum(MIGRATION_FILE_KINDS),
  fileName: text(255),
});

const answerSchema = z.strictObject({ question: text(500), answer: text(IMPORT_NOTE_MAX) });

const stageEntrySchema = z.strictObject({ stageRef: ref, enteredAt: date });

const applicationSchema = z.strictObject({
  ref,
  candidateRef: ref,
  jobRef: ref,
  /** Current stage, one of the job's stages. */
  stageRef: ref,
  createdAt: date,
  outcome: z.enum(OUTCOMES).optional(),
  closedAt: date.optional(),
  /** Where the application came from in the source (e.g. `linkedin`). */
  origin: text(ORIGIN_MAX).optional(),
  coverLetter: text(TEXT_MAX).optional(),
  answers: z.array(answerSchema).max(MIGRATION_LIMITS.answersPerApplication).default([]),
  files: z.array(fileSchema).max(MIGRATION_LIMITS.filesPerApplication).default([]),
  stageHistory: z.array(stageEntrySchema).max(MIGRATION_LIMITS.stageHistoryPerApplication).default([]),
});

const noteSchema = z.strictObject({
  candidateRef: ref,
  applicationRef: ref.optional(),
  authorRef: ref.optional(),
  /** For authors who are not among `users`. */
  authorName: text(120).optional(),
  body: text(IMPORT_NOTE_MAX),
  createdAt: date,
  private: z.boolean().optional(),
});

/** A past email: stored as history, never sent and never counted against sending caps. */
const messageSchema = z.strictObject({
  applicationRef: ref,
  direction: z.enum(MESSAGE_DIRECTIONS),
  at: date,
  from: text(320).optional(),
  to: text(320).optional(),
  subject: text(1000).optional(),
  body: text(MESSAGE_TEXT_MAX),
});

/**
 * The migration package (ADR 0009): `migration.json` plus the files it references, in one ZIP. Every producer (built-in
 * connectors, the agent skill, a hand-written package) meets this schema. Every object is strict: an unknown field is
 * refused, never ignored, so scores, ratings, demographic data, photos or birth dates cannot slip in under another name.
 */
const migrationPackageShape = z.strictObject({
  format: z.literal(MIGRATION_PACKAGE_FORMAT),
  version: z.literal(1),
  source: sourceSchema,
  users: z.array(userSchema).max(MIGRATION_LIMITS.users).default([]),
  jobs: z.array(jobSchema).max(MIGRATION_LIMITS.jobs),
  candidates: z.array(candidateSchema).max(MIGRATION_LIMITS.candidates),
  applications: z.array(applicationSchema).max(MIGRATION_LIMITS.applications),
  notes: z.array(noteSchema).max(MIGRATION_LIMITS.notes).default([]),
  messages: z.array(messageSchema).max(MIGRATION_LIMITS.messages).default([]),
});

/**
 * Each kind of item on its own, for producers that build a package item by item (the connectors' `PackageBuilder`):
 * the same strict shapes as in the package, so an item accepted here is accepted in the package.
 */
export const migrationPackageItemSchemas = {
  user: userSchema,
  job: jobSchema,
  candidate: candidateSchema,
  application: applicationSchema,
  note: noteSchema,
  message: messageSchema,
} as const;

export type MigrationPackage = z.infer<typeof migrationPackageShape>;
export type MigrationPackageInput = z.input<typeof migrationPackageShape>;
export type MigrationJob = MigrationPackage['jobs'][number];
export type MigrationCandidate = MigrationPackage['candidates'][number];
export type MigrationApplication = MigrationPackage['applications'][number];
export type MigrationFile = MigrationApplication['files'][number];
export type MigrationNote = MigrationPackage['notes'][number];
export type MigrationMessage = MigrationPackage['messages'][number];

/** The package with its cross-references checked: refs unique and resolved, file paths safe, dates in order. */
export const migrationPackageSchema = migrationPackageShape.superRefine((value, ctx) => {
  for (const issue of checkMigrationReferences(value)) {
    ctx.addIssue({ code: 'custom', path: [...issue.path], message: issue.message });
  }
});

export const parseMigrationPackage = (input: unknown) => migrationPackageSchema.safeParse(input);

/** JSON Schema (draft 2020-12) of `migration.json`. Cross-references are checked by the product, not by the JSON Schema. */
export function migrationPackageJsonSchema(): Record<string, unknown> {
  return {
    ...z.toJSONSchema(migrationPackageShape, { io: 'input' }),
    $id: MIGRATION_PACKAGE_SCHEMA_ID,
    title: 'Migration package (v1)',
  };
}
