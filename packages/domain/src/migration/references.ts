import { MIGRATION_LIMITS, isMigrationFilePath } from './constants.js';
import type { MigrationApplication, MigrationPackage } from './package.js';

/** A cross-reference problem in a migration package, with the path of the offending value. */
export interface MigrationReferenceIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

type Issues = MigrationReferenceIssue[];

const before = (later: string, earlier: string): boolean => Date.parse(later) < Date.parse(earlier);

/** Pushes `duplicate_ref` for every ref already seen in the collection; returns the set of refs. */
function uniqueRefs(items: readonly { readonly ref: string }[], path: readonly (string | number)[], issues: Issues): Set<string> {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.ref)) issues.push({ path: [...path, index, 'ref'], message: 'duplicate_ref' });
    seen.add(item.ref);
  });
  return seen;
}

function checkJobs(pkg: MigrationPackage, issues: Issues): Map<string, Set<string>> {
  uniqueRefs(pkg.jobs, ['jobs'], issues);
  const stagesByJob = new Map<string, Set<string>>();
  pkg.jobs.forEach((job, index) => {
    stagesByJob.set(job.ref, uniqueRefs(job.stages, ['jobs', index, 'stages'], issues));
    if (job.closedAt === undefined) return;
    if (job.status !== 'closed') issues.push({ path: ['jobs', index, 'closedAt'], message: 'closed_at_requires_closed_status' });
    if (before(job.closedAt, job.createdAt)) issues.push({ path: ['jobs', index, 'closedAt'], message: 'closed_before_created' });
  });
  return stagesByJob;
}

function checkCandidates(pkg: MigrationPackage, issues: Issues): Set<string> {
  pkg.candidates.forEach((candidate, index) => {
    const { consent } = candidate;
    if (consent?.expiresAt !== undefined && before(consent.expiresAt, consent.givenAt)) {
      issues.push({ path: ['candidates', index, 'consent', 'expiresAt'], message: 'expires_before_given' });
    }
  });
  return uniqueRefs(pkg.candidates, ['candidates'], issues);
}

function checkFiles(application: MigrationApplication, index: number, seenPaths: Set<string>, issues: Issues): void {
  let cvs = 0;
  application.files.forEach((file, fileIndex) => {
    const path = ['applications', index, 'files', fileIndex, 'path'];
    if (!isMigrationFilePath(file.path)) issues.push({ path, message: 'invalid_file_path' });
    if (seenPaths.has(file.path)) issues.push({ path, message: 'duplicate_file' });
    seenPaths.add(file.path);
    if (file.kind === 'cv') cvs += 1;
  });
  if (cvs > 1) issues.push({ path: ['applications', index, 'files'], message: 'more_than_one_cv' });
}

function checkApplicationDates(application: MigrationApplication, index: number, issues: Issues): void {
  const { outcome, closedAt, createdAt } = application;
  if (outcome !== undefined && closedAt === undefined) {
    issues.push({ path: ['applications', index, 'closedAt'], message: 'outcome_requires_closed_at' });
  }
  if (outcome === undefined && closedAt !== undefined) {
    issues.push({ path: ['applications', index, 'outcome'], message: 'closed_at_requires_outcome' });
  }
  if (closedAt !== undefined && before(closedAt, createdAt)) {
    issues.push({ path: ['applications', index, 'closedAt'], message: 'closed_before_created' });
  }
}

interface Known {
  readonly stagesByJob: ReadonlyMap<string, ReadonlySet<string>>;
  readonly candidates: ReadonlySet<string>;
}

function checkApplication(application: MigrationApplication, index: number, known: Known, issues: Issues): void {
  const at = (...rest: (string | number)[]) => ['applications', index, ...rest];
  if (!known.candidates.has(application.candidateRef)) issues.push({ path: at('candidateRef'), message: 'unknown_candidate' });
  const stages = known.stagesByJob.get(application.jobRef);
  if (stages === undefined) {
    issues.push({ path: at('jobRef'), message: 'unknown_job' });
    return;
  }
  if (!stages.has(application.stageRef)) issues.push({ path: at('stageRef'), message: 'unknown_stage' });
  application.stageHistory.forEach((entry, entryIndex) => {
    if (!stages.has(entry.stageRef)) issues.push({ path: at('stageHistory', entryIndex, 'stageRef'), message: 'unknown_stage' });
  });
}

/** Checks applications; returns the candidate ref of every application ref. */
function checkApplications(pkg: MigrationPackage, known: Known, issues: Issues): Map<string, string> {
  uniqueRefs(pkg.applications, ['applications'], issues);
  const seenPaths = new Set<string>();
  const candidateOf = new Map<string, string>();
  pkg.applications.forEach((application, index) => {
    candidateOf.set(application.ref, application.candidateRef);
    checkApplication(application, index, known, issues);
    checkApplicationDates(application, index, issues);
    checkFiles(application, index, seenPaths, issues);
  });
  if (seenPaths.size > MIGRATION_LIMITS.files) issues.push({ path: ['applications'], message: 'too_many_files' });
  return candidateOf;
}

function checkNotes(pkg: MigrationPackage, candidates: ReadonlySet<string>, candidateOf: ReadonlyMap<string, string>, issues: Issues): void {
  const users = uniqueRefs(pkg.users, ['users'], issues);
  pkg.notes.forEach((note, index) => {
    const at = (field: string) => ['notes', index, field];
    if (!candidates.has(note.candidateRef)) issues.push({ path: at('candidateRef'), message: 'unknown_candidate' });
    if (note.authorRef !== undefined && !users.has(note.authorRef)) issues.push({ path: at('authorRef'), message: 'unknown_user' });
    if (note.applicationRef === undefined) return;
    const owner = candidateOf.get(note.applicationRef);
    if (owner === undefined) issues.push({ path: at('applicationRef'), message: 'unknown_application' });
    else if (owner !== note.candidateRef) issues.push({ path: at('applicationRef'), message: 'application_of_another_candidate' });
  });
}

/**
 * Every cross-reference of a package: refs unique per collection (stages per job), applications pointing at an existing
 * candidate, job and a stage of that job, notes and messages at existing records, authors among `users`, file paths
 * safe and unique, closing dates after creation, an outcome exactly when there is a closing date.
 */
export function checkMigrationReferences(pkg: MigrationPackage): readonly MigrationReferenceIssue[] {
  const issues: Issues = [];
  const stagesByJob = checkJobs(pkg, issues);
  const candidates = checkCandidates(pkg, issues);
  const candidateOf = checkApplications(pkg, { stagesByJob, candidates }, issues);
  checkNotes(pkg, candidates, candidateOf, issues);
  pkg.messages.forEach((message, index) => {
    if (!candidateOf.has(message.applicationRef)) {
      issues.push({ path: ['messages', index, 'applicationRef'], message: 'unknown_application' });
    }
  });
  return issues;
}
