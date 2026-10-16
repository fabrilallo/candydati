import {
  migratedJobContent,
  planMigrationCommit,
  type JobContent,
  type MigrationBatch,
  type MigrationCommitPlan,
  type MigrationPackage,
  type PlannedMigrationApplication,
  type PlannedMigrationJob,
  type PlannedMigrationPerson,
} from '@candydati/domain';
import type { MigrationCommitDeps } from '../../migration-commit-ports.js';
import type { MigrationPackageEntry } from '../../migration-ports.js';

/** Kinds of rows a migration writes: each gets a stable id from its batch, its kind and its package key. */
export type MigratedRowKind = 'job' | 'candidate' | 'application' | 'stage_event' | 'note' | 'message';

/** Who signs a migrated note: a member found by email, else the name the package gives. */
export interface NoteAuthor {
  readonly authorId: string | null;
  readonly authorName: string | null;
}

/** What every step of one run of the commit shares. Built once per run, read-only. */
export interface MigrationCommitContext {
  readonly deps: MigrationCommitDeps;
  readonly batch: MigrationBatch;
  readonly plan: MigrationCommitPlan;
  /** The planned jobs by package ref. */
  readonly jobsByRef: ReadonlyMap<string, PlannedMigrationJob>;
  /** Package application ref → the person it belongs to. */
  readonly personOfApplication: ReadonlyMap<string, string>;
  /** People to ask for reconfirmation (no consent date, an email), each with the application the request is about. */
  readonly reconfirmations: readonly Reconfirmation[];
  /** The package's files, read one at a time when their application is written. */
  readonly files: ReadonlyMap<string, MigrationPackageEntry>;
  readonly sourceSystem: string;
  readonly organization: { readonly id: string; readonly name: string };
  /** Job content per package job ref, checked before anything is written. */
  readonly contents: ReadonlyMap<string, JobContent>;
  /** By package user ref. */
  readonly authors: ReadonlyMap<string, NoteAuthor>;
  /**
   * The moment the operator confirmed (from the declarations): every run plans against it, so a retry sees the same
   * people (whose retention expired, who is to renew) and the cursor of the previous run still points at the same rows.
   */
  readonly at: Date;
  /** The same package row always gets the same id: a retry overwrites the same CV key and finds what it already wrote. */
  readonly rowId: (kind: MigratedRowKind, key: string) => string;
}

export interface Reconfirmation {
  readonly person: PlannedMigrationPerson;
  /** Their most recent written application waiting for reconfirmation. */
  readonly application: PlannedMigrationApplication;
}

/** One request per person (ADR 0008): about their latest application to renew; reconfirming it renews the others of the batch. */
function reconfirmationsOf(plan: MigrationCommitPlan): readonly Reconfirmation[] {
  const latest = new Map<string, PlannedMigrationApplication>();
  for (const entry of plan.applications) {
    if (entry.duplicate || entry.consentStatus !== 'to_renew') continue;
    const current = latest.get(entry.personKey);
    if (!current || Date.parse(entry.application.createdAt) > Date.parse(current.application.createdAt)) latest.set(entry.personKey, entry);
  }
  return plan.people.flatMap((person) => {
    const application = latest.get(person.key);
    return person.email !== null && application ? [{ person, application }] : [];
  });
}

/** A reason the commit can never succeed, safe to show: the batch fails at once instead of being retried. */
export interface MigrationCommitFailure {
  readonly failure: string;
}

const uuidShaped = (hex: string): string => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;

async function authorsOf(deps: MigrationCommitDeps, organizationId: string, manifest: MigrationPackage): Promise<ReadonlyMap<string, NoteAuthor>> {
  const members = new Map((await deps.members.list(organizationId)).map((member) => [member.email.toLowerCase(), member.userId] as const));
  return new Map(
    manifest.users.map((user) => {
      const memberId = user.email === undefined ? undefined : members.get(user.email.toLowerCase());
      return [user.ref, memberId === undefined ? { authorId: null, authorName: user.name } : { authorId: memberId, authorName: null }] as const;
    }),
  );
}

function contentsOf(plan: MigrationCommitPlan): ReadonlyMap<string, JobContent> | null {
  try {
    return new Map(plan.jobs.map((planned) => [planned.job.ref, migratedJobContent(planned.job, planned.stages)] as const));
  } catch {
    return null;
  }
}

/**
 * Everything one run of the commit needs, or the reason it cannot run: the package refused by the reader (its code),
 * no privacy notice (`privacy_notice_missing`), a job whose content is not a valid job (`job_content_invalid`).
 */
export async function buildCommitContext(deps: MigrationCommitDeps, batch: MigrationBatch): Promise<MigrationCommitContext | MigrationCommitFailure> {
  const { organizationId } = batch;
  const opened = await deps.packages.open(batch.packageKey);
  if (!opened.ok) return { failure: opened.code };
  const notice = await deps.privacyNotices.findActive(organizationId);
  if (notice === null) return { failure: 'privacy_notice_missing' };
  const organization = await deps.organizations.findById(organizationId);
  if (!organization) return { failure: 'organization_missing' };
  const { manifest, files } = opened.package;
  const at = batch.declarations === null ? batch.updatedAt : new Date(batch.declarations.at);
  const plan = planMigrationCommit({ manifest, stageMapping: batch.stageMapping, excludedJobs: batch.excludedJobs, notice, now: at });
  const contents = contentsOf(plan);
  if (contents === null) return { failure: 'job_content_invalid' };
  const rowId = (kind: MigratedRowKind, key: string): string => uuidShaped(deps.hash(`migration\u0000${batch.id}\u0000${kind}\u0000${key}`));
  return {
    deps,
    batch,
    plan,
    jobsByRef: new Map(plan.jobs.map((planned) => [planned.job.ref, planned] as const)),
    personOfApplication: new Map(plan.applications.map((entry) => [entry.application.ref, entry.personKey] as const)),
    reconfirmations: reconfirmationsOf(plan),
    files,
    sourceSystem: manifest.source.system,
    organization: { id: organization.id, name: organization.name },
    contents,
    authors: await authorsOf(deps, organizationId, manifest),
    at,
    rowId,
  };
}
