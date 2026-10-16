import { CV_MAX_BYTES } from '../candidate/application.js';
import type { PrivacyNotice } from '../candidate/privacy.js';
import { MAX_STAGES } from '../job/content.js';
import type { MigrationAnalysisCounts, MigrationIssueCode, MigrationIssueDraft, MigrationIssueLevel, MigrationJobCount, MigrationStageMapping } from './batch.js';
import { migrationConsentOf } from './consent.js';
import type { MigrationApplication, MigrationPackage } from './package.js';
import { proposeStageMapping } from './stage-mapping.js';

/** What the reader learnt about one file of the package, without keeping its bytes. */
export interface MigrationFileFacts {
  readonly size: number;
  /** For files declared `cv`: whether the content is a PDF or a Word document. null when not checked. */
  readonly cvLike: boolean | null;
}

export interface MigrationAnalysisInput {
  readonly manifest: MigrationPackage;
  readonly now: Date;
  /** The organization's active privacy notice; null when it never published one. */
  readonly notice: Pick<PrivacyNotice, 'retentionDays'> | null;
  /** Lowercased emails of the package that already belong to a candidate of the organization. */
  readonly existingEmails: ReadonlySet<string>;
  /** By path in the package. A referenced path absent here is reported missing. */
  readonly files: ReadonlyMap<string, MigrationFileFacts>;
  /** Files of the package that nothing references. */
  readonly unreferenced: readonly string[];
}

export interface MigrationAnalysis {
  readonly counts: MigrationAnalysisCounts;
  readonly stageMapping: MigrationStageMapping;
  readonly issues: readonly MigrationIssueDraft[];
}

const issue = (level: MigrationIssueLevel, code: MigrationIssueCode, ref: string | null = null, detail: string | null = null): MigrationIssueDraft => ({
  level,
  code,
  ref,
  detail,
});

interface People {
  /** Refs of the candidates that come across. */
  readonly included: ReadonlySet<string>;
  /** Candidate ref → the person it is in Candydati (by email when there is one): two refs with one email are one person. */
  readonly personOf: ReadonlyMap<string, string>;
  readonly issues: readonly MigrationIssueDraft[];
  readonly counts: Pick<MigrationAnalysisCounts, 'candidates' | 'merged' | 'consentGiven' | 'consentToRenew' | 'consentExpired'>;
}

/** Consent buckets (expired people are left out), merges with existing candidates, missing and repeated emails. */
function analysePeople({ manifest, notice, now, existingEmails }: MigrationAnalysisInput): People {
  const included = new Set<string>();
  const personOf = new Map<string, string>();
  const seenEmails = new Set<string>();
  const issues: MigrationIssueDraft[] = [];
  const tally = { given: 0, toRenew: 0, expired: 0, merged: 0 };
  for (const candidate of manifest.candidates) {
    const consent = migrationConsentOf(candidate, notice, now);
    if (consent.bucket === 'expired') {
      tally.expired += 1;
      issues.push(issue('warning', 'consent_expired', candidate.ref, consent.expiresAt?.toISOString() ?? null));
      continue;
    }
    included.add(candidate.ref);
    if (consent.bucket === 'given') tally.given += 1;
    else tally.toRenew += 1;
    const email = candidate.email?.toLowerCase();
    personOf.set(candidate.ref, email === undefined ? `ref:${candidate.ref}` : `email:${email}`);
    if (email === undefined) {
      issues.push(issue('warning', 'no_email', candidate.ref));
      continue;
    }
    if (seenEmails.has(email)) issues.push(issue('warning', 'duplicate_email', candidate.ref));
    seenEmails.add(email);
    if (existingEmails.has(email)) {
      tally.merged += 1;
      issues.push(issue('info', 'merge_existing', candidate.ref));
    }
  }
  if (tally.toRenew > 0) issues.push(issue('info', 'consent_to_renew', null, String(tally.toRenew)));
  return {
    included,
    personOf,
    issues,
    counts: { candidates: included.size, merged: tally.merged, consentGiven: tally.given, consentToRenew: tally.toRenew, consentExpired: tally.expired },
  };
}

const emptyJobCount = (job: MigrationPackage['jobs'][number]): MigrationJobCount => ({
  jobRef: job.ref,
  title: job.title,
  status: job.status,
  stages: job.stages.length,
  applications: 0,
  open: 0,
  hired: 0,
  notSelected: 0,
  withdrawn: 0,
});

const OUTCOME_KEYS = { hired: 'hired', not_selected: 'notSelected', withdrawn: 'withdrawn' } as const;

const counted = (count: MigrationJobCount, application: MigrationApplication): MigrationJobCount => {
  const key = application.outcome === undefined ? 'open' : OUTCOME_KEYS[application.outcome];
  return { ...count, applications: count.applications + 1, [key]: count[key] + 1 };
};

interface Applications {
  readonly included: readonly MigrationApplication[];
  readonly excluded: readonly MigrationApplication[];
  readonly perJob: readonly MigrationJobCount[];
  readonly issues: readonly MigrationIssueDraft[];
}

/** Applications of people who come across, counted per job; a second open one of the same person to the same job is flagged. */
function analyseApplications(manifest: MigrationPackage, people: People): Applications {
  const perJob = new Map(manifest.jobs.map((job) => [job.ref, emptyJobCount(job)] as const));
  const openSeen = new Set<string>();
  const issues: MigrationIssueDraft[] = [];
  const included: MigrationApplication[] = [];
  const excluded: MigrationApplication[] = [];
  for (const application of manifest.applications) {
    if (!people.included.has(application.candidateRef)) {
      excluded.push(application);
      continue;
    }
    included.push(application);
    const count = perJob.get(application.jobRef);
    if (count) perJob.set(application.jobRef, counted(count, application));
    if (application.outcome !== undefined) continue;
    const key = `${people.personOf.get(application.candidateRef) ?? application.candidateRef}|${application.jobRef}`;
    if (openSeen.has(key)) issues.push(issue('warning', 'already_applied', application.ref));
    openSeen.add(key);
  }
  return { included, excluded, perJob: [...perJob.values()], issues };
}

/** Stages no type fits (the operator names them) and jobs with more stages than a pipeline holds. */
function stageIssues(manifest: MigrationPackage, mapping: MigrationStageMapping): MigrationIssueDraft[] {
  const unmapped = mapping.filter((entry) => entry.type === 'other').map((entry) => issue('info', 'stage_unmapped', `${entry.jobRef}/${entry.stageRef}`, entry.title));
  const crowded = manifest.jobs.filter((job) => job.stages.length > MAX_STAGES).map((job) => issue('warning', 'too_many_stages', job.ref, String(job.stages.length)));
  return [...crowded, ...unmapped];
}

/** The files of applications that come across: missing, larger than a stored CV may be, declared CV but not one. */
function fileIssues(applications: readonly MigrationApplication[], input: MigrationAnalysisInput): MigrationIssueDraft[] {
  const found = applications.flatMap((application) =>
    application.files.flatMap((file) => {
      const facts = input.files.get(file.path);
      if (facts === undefined) return [issue('warning', 'file_missing', file.path)];
      if (facts.size > CV_MAX_BYTES) return [issue('warning', 'file_too_large', file.path, String(facts.size))];
      if (file.kind === 'cv' && facts.cvLike === false) return [issue('warning', 'file_not_cv', file.path)];
      return [];
    }),
  );
  return [...found, ...input.unreferenced.map((path) => issue('info', 'file_unreferenced', path))];
}

const filesOf = (applications: readonly MigrationApplication[]): number => applications.reduce((sum, application) => sum + application.files.length, 0);
const levelCount = (issues: readonly MigrationIssueDraft[], level: MigrationIssueLevel): number => issues.filter((found) => found.level === level).length;

/**
 * The preview of a migration package (Task 3.2), computed without I/O: who comes across and under which consent, who is
 * merged with an existing candidate, where each stage lands, what is wrong with the files, and the counts per job.
 * Nothing here decides about a person: it only sorts what the package says.
 */
export function analyzeMigrationPackage(input: MigrationAnalysisInput): MigrationAnalysis {
  const { manifest } = input;
  const people = analysePeople(input);
  const applications = analyseApplications(manifest, people);
  const stageMapping = proposeStageMapping(manifest.jobs);
  const kept = new Set(applications.included.map((application) => application.ref));
  const notes = manifest.notes.filter((note) => people.included.has(note.candidateRef)).length;
  const messages = manifest.messages.filter((message) => kept.has(message.applicationRef)).length;
  const issues = [
    ...(input.notice === null ? [issue('error', 'privacy_notice_missing')] : []),
    ...people.issues,
    ...applications.issues,
    ...stageIssues(manifest, stageMapping),
    ...fileIssues(applications.included, input),
  ];
  const counts: MigrationAnalysisCounts = {
    ...people.counts,
    jobs: manifest.jobs.length,
    applications: applications.included.length,
    notes,
    messages,
    files: filesOf(applications.included),
    excludedApplications: applications.excluded.length,
    excludedNotes: manifest.notes.length - notes,
    excludedMessages: manifest.messages.length - messages,
    excludedFiles: filesOf(applications.excluded),
    issueErrors: levelCount(issues, 'error'),
    issueWarnings: levelCount(issues, 'warning'),
    issueInfos: levelCount(issues, 'info'),
    perJob: applications.perJob,
  };
  return { counts, stageMapping, issues };
}
