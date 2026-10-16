import type { Outcome } from '../candidate/application.js';
import { retentionExpiry, type ConsentRecord, type ConsentScope, type ConsentStatus, type PrivacyNotice } from '../candidate/privacy.js';
import { IMPORT_RECONFIRM_DAYS } from '../import/import.js';
import { DAY_MS } from '../response/response-state.js';
import type { MigrationStageMapping } from './batch.js';
import { migrationPipelines, type MigrationTargetStage } from './choices.js';
import { migrationConsentOf, type MigrationConsentDecision } from './consent.js';
import type { MigrationApplication, MigrationCandidate, MigrationJob, MigrationMessage, MigrationNote, MigrationPackage } from './package.js';

export interface MigrationPlanInput {
  readonly manifest: MigrationPackage;
  readonly stageMapping: MigrationStageMapping;
  readonly excludedJobs: readonly string[];
  /** The organization's active notice: the commit refuses to start without one. */
  readonly notice: Pick<PrivacyNotice, 'id' | 'version' | 'retentionDays'>;
  readonly now: Date;
}

/** Where a package stage lands: the index of its stage in the job's pipeline, or the first column (`received`). */
export type MigrationStageTargetRef = number | 'received';

export interface PlannedMigrationJob {
  readonly job: MigrationJob;
  /** Closed jobs stay closed; open and draft ones come in as drafts, to be completed and published under the usual rules. */
  readonly status: 'draft' | 'closed';
  readonly closedAt: Date | null;
  readonly stages: readonly MigrationTargetStage[];
  readonly targets: ReadonlyMap<string, MigrationStageTargetRef>;
}

export interface PlannedMigrationPerson {
  /** `email:<address>` or `ref:<ref>`: two package refs with one email are one person. */
  readonly key: string;
  /** The first of their refs in the package: the profile a new candidate gets. */
  readonly candidate: MigrationCandidate;
  /** Lowercased; null when the package has none. */
  readonly email: string | null;
  readonly retentionExpiresAt: Date;
  readonly talentPool: boolean;
  /** Some application of theirs comes without a consent date: the reconfirmation of ADR 0008 applies. */
  readonly toRenew: boolean;
}

export interface PlannedMigrationApplication {
  readonly application: MigrationApplication;
  readonly personKey: string;
  readonly consent: ConsentRecord;
  readonly consentStatus: ConsentStatus;
  readonly retentionExpiresAt: Date;
  readonly stageChangedAt: Date;
  /** A second open application of the same person to the same job: not written (`already_applied` in the preview). */
  readonly duplicate: boolean;
}

export interface PlannedMigrationNote {
  /** Position in the package: notes have no ref. */
  readonly index: number;
  readonly note: MigrationNote;
  readonly personKey: string;
  /** null for a note about the person, or about an application that is not written. */
  readonly applicationRef: string | null;
}

export interface PlannedMigrationMessage {
  readonly index: number;
  readonly message: MigrationMessage;
}

/** Everything the commit writes, in the order it writes it. Excluded jobs and people whose retention expired are not in it. */
export interface MigrationCommitPlan {
  readonly jobs: readonly PlannedMigrationJob[];
  readonly people: readonly PlannedMigrationPerson[];
  readonly applications: readonly PlannedMigrationApplication[];
  readonly notes: readonly PlannedMigrationNote[];
  readonly messages: readonly PlannedMigrationMessage[];
}

const DEFAULT_SCOPES: readonly ConsentScope[] = ['selection'];
const time = (iso: string): Date => new Date(iso);
const latest = (dates: readonly Date[]): Date | null => dates.reduce<Date | null>((max, d) => (max === null || d > max ? d : max), null);

function closingDate(job: MigrationJob, applications: readonly MigrationApplication[]): Date {
  if (job.closedAt !== undefined) return time(job.closedAt);
  const activity = applications.filter((a) => a.jobRef === job.ref).map((a) => time(a.closedAt ?? a.createdAt));
  return latest(activity) ?? time(job.createdAt);
}

function planJobs(input: MigrationPlanInput, excluded: ReadonlySet<string>): readonly PlannedMigrationJob[] {
  const pipelines = new Map(migrationPipelines(input.stageMapping).map((pipeline) => [pipeline.jobRef, pipeline] as const));
  return input.manifest.jobs
    .filter((job) => !excluded.has(job.ref))
    .map((job) => {
      const pipeline = pipelines.get(job.ref);
      const stages = pipeline?.stages ?? [];
      const targets = new Map<string, MigrationStageTargetRef>([
        ...(pipeline?.received ?? []).map((ref) => [ref, 'received'] as const),
        ...stages.flatMap((stage, index) => stage.stageRefs.map((ref) => [ref, index] as const)),
      ]);
      const status = job.status === 'closed' ? 'closed' : 'draft';
      return { job, status, closedAt: status === 'closed' ? closingDate(job, input.manifest.applications) : null, stages, targets };
    });
}

/** The consent record and retention of one application, from the decision about its package candidate. */
function consentOf(input: MigrationPlanInput, candidate: MigrationCandidate, decision: MigrationConsentDecision): Pick<PlannedMigrationApplication, 'consent' | 'consentStatus' | 'retentionExpiresAt'> {
  const mark = { origin: 'migration', sourceSystem: input.manifest.source.system } as const;
  if (decision.bucket !== 'given' || decision.givenAt === null) {
    const consent = { privacyNoticeId: '', privacyNoticeVersion: 0, scopes: [], givenAt: input.now, ...mark };
    return { consent, consentStatus: 'to_renew', retentionExpiresAt: new Date(input.now.getTime() + IMPORT_RECONFIRM_DAYS * DAY_MS) };
  }
  const scopes = candidate.consent?.scopes !== undefined && candidate.consent.scopes.length > 0 ? [...new Set(candidate.consent.scopes)] : DEFAULT_SCOPES;
  const consent = { privacyNoticeId: input.notice.id, privacyNoticeVersion: input.notice.version, scopes, givenAt: decision.givenAt, ...mark };
  return { consent, consentStatus: 'given', retentionExpiresAt: decision.expiresAt ?? retentionExpiry(consent, input.notice) };
}

interface Candidates {
  readonly byRef: ReadonlyMap<string, MigrationCandidate>;
  readonly decisions: ReadonlyMap<string, MigrationConsentDecision>;
  readonly keyOf: (ref: string) => string;
}

/** People whose retention has not expired, with their consent decision and the key that merges refs sharing an email. */
function readCandidates(input: MigrationPlanInput): Candidates {
  const byRef = new Map(input.manifest.candidates.map((candidate) => [candidate.ref, candidate] as const));
  const decisions = new Map(
    input.manifest.candidates
      .map((candidate) => [candidate.ref, migrationConsentOf(candidate, input.notice, input.now)] as const)
      .filter(([, decision]) => decision.bucket !== 'expired'),
  );
  const keyOf = (ref: string): string => {
    const email = byRef.get(ref)?.email?.toLowerCase();
    return email === undefined ? `ref:${ref}` : `email:${email}`;
  };
  return { byRef, decisions, keyOf };
}

function lastEntered(application: MigrationApplication): Date {
  return latest(application.stageHistory.map((entry) => time(entry.enteredAt))) ?? time(application.createdAt);
}

function planApplications(input: MigrationPlanInput, excluded: ReadonlySet<string>, candidates: Candidates): readonly PlannedMigrationApplication[] {
  const openSeen = new Set<string>();
  return input.manifest.applications.flatMap((application) => {
    const decision = candidates.decisions.get(application.candidateRef);
    const candidate = candidates.byRef.get(application.candidateRef);
    if (excluded.has(application.jobRef) || decision === undefined || candidate === undefined) return [];
    const personKey = candidates.keyOf(application.candidateRef);
    const openKey = `${personKey}|${application.jobRef}`;
    const duplicate = application.outcome === undefined && openSeen.has(openKey);
    if (application.outcome === undefined) openSeen.add(openKey);
    return [{ application, personKey, ...consentOf(input, candidate, decision), stageChangedAt: lastEntered(application), duplicate }];
  });
}

function planPeople(input: MigrationPlanInput, candidates: Candidates, applications: readonly PlannedMigrationApplication[]): readonly PlannedMigrationPerson[] {
  const written = applications.filter((entry) => !entry.duplicate);
  const seen = new Set<string>();
  return input.manifest.candidates.flatMap((candidate) => {
    const key = candidates.keyOf(candidate.ref);
    const own = written.filter((entry) => entry.personKey === key);
    if (seen.has(key) || !candidates.decisions.has(candidate.ref) || own.length === 0) return [];
    seen.add(key);
    return [
      {
        key,
        candidate,
        email: candidate.email?.toLowerCase() ?? null,
        retentionExpiresAt: latest(own.map((entry) => entry.retentionExpiresAt)) ?? input.now,
        talentPool: own.some((entry) => entry.consentStatus === 'given' && entry.consent.scopes.includes('talent_pool')),
        toRenew: own.some((entry) => entry.consentStatus === 'to_renew'),
      },
    ];
  });
}

function planNotes(input: MigrationPlanInput, candidates: Candidates, people: ReadonlySet<string>, applications: ReadonlyMap<string, PlannedMigrationApplication>): readonly PlannedMigrationNote[] {
  return input.manifest.notes.flatMap((note, index) => {
    const personKey = candidates.keyOf(note.candidateRef);
    if (!candidates.decisions.has(note.candidateRef) || !people.has(personKey)) return [];
    if (note.applicationRef === undefined) return [{ index, note, personKey, applicationRef: null }];
    const about = applications.get(note.applicationRef);
    if (about === undefined) return [];
    return [{ index, note, personKey, applicationRef: about.duplicate ? null : note.applicationRef }];
  });
}

/**
 * What a migration commit writes (Task 3.4), computed without I/O from the package and the operator's choices: the
 * jobs that come across with their merged pipelines, one person per email, each application with its consent carried
 * over (ADR 0009, decision 2), and the notes and messages that hang from them. Nothing here ranks or judges a person.
 */
export function planMigrationCommit(input: MigrationPlanInput): MigrationCommitPlan {
  const excluded = new Set(input.excludedJobs);
  const candidates = readCandidates(input);
  const applications = planApplications(input, excluded, candidates);
  const people = planPeople(input, candidates, applications);
  const byRef = new Map(applications.map((entry) => [entry.application.ref, entry] as const));
  const messages = input.manifest.messages.flatMap((message, index) => (byRef.get(message.applicationRef)?.duplicate === false ? [{ index, message }] : []));
  return {
    jobs: planJobs(input, excluded),
    people,
    applications,
    notes: planNotes(input, candidates, new Set(people.map((person) => person.key)), byRef),
    messages,
  };
}

/** One step of an application's history as the commit records it (a backfilled stage event). */
export interface MigratedStageMove {
  readonly from: MigrationStageTargetRef | null;
  readonly to: MigrationStageTargetRef | null;
  readonly outcome: Outcome | null;
  readonly at: Date;
}

/**
 * The history of an application in its new pipeline: its stage entries in time order, where moves between package stages
 * merged into one stage disappear, then the outcome. Without history, the application enters its current stage when it
 * was created.
 */
export function migratedStageMoves(application: MigrationApplication, targets: ReadonlyMap<string, MigrationStageTargetRef>): readonly MigratedStageMove[] {
  const entries = application.stageHistory.length > 0 ? application.stageHistory : [{ stageRef: application.stageRef, enteredAt: application.createdAt }];
  const ordered = entries.map((entry, order) => ({ target: targets.get(entry.stageRef), at: time(entry.enteredAt), order })).toSorted((a, b) => a.at.getTime() - b.at.getTime() || a.order - b.order);
  const moves: MigratedStageMove[] = [];
  let current: MigrationStageTargetRef | null = null;
  for (const { target, at } of ordered) {
    if (target === undefined || target === current) continue;
    moves.push({ from: current, to: target, outcome: null, at });
    current = target;
  }
  if (application.outcome === undefined) return moves;
  const at = application.closedAt === undefined ? lastEntered(application) : time(application.closedAt);
  return [...moves, { from: current, to: null, outcome: application.outcome, at }];
}
