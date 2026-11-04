import type { Application, Candidate, CandidateNote } from '@candydati/domain';
import type { ShortlistDeps } from '../../client-ports.js';
import { ValidationError } from '../../errors.js';
import type { JobTeamRepository } from '../../job-team-ports.js';

/**
 * The stages of a job whose notes never leave the organization: restricted stages (PRODUCT.md §6.2) are read by a few
 * people inside, so they are never shown to a client, whoever sends. Without the team repository nothing written at a
 * stage is shareable: the check fails closed.
 */
export async function restrictedStagesOf(jobTeams: JobTeamRepository | undefined, organizationId: string, jobId: string): Promise<(stageId: string | null) => boolean> {
  if (!jobTeams) return (stageId) => stageId !== null;
  const stages = new Set((await jobTeams.listRestrictedStages(organizationId, jobId)).map((stage) => stage.stageId));
  return (stageId) => stageId !== null && stages.has(stageId);
}

export interface PreparedCandidate {
  readonly application: Application;
  readonly candidate: Candidate;
  readonly shareCv: boolean;
  readonly noteIds: readonly string[];
}

interface CandidateChoice {
  readonly applicationId: string;
  readonly shareCv: boolean;
  readonly noteIds: readonly string[];
}

const invalid = (index: number, field: string, message: string): never => {
  throw new ValidationError([{ path: `candidates.${index}.${field}`, message }]);
};

/**
 * A note may be shown when it is about this candidate and is either about this application or about the person as a
 * whole. Notes about another application of the same person stay inside the agency.
 */
const shareableNote = (note: CandidateNote, application: Application, restricted: (stageId: string | null) => boolean): boolean =>
  note.candidateId === application.candidateId && (note.applicationId === null || note.applicationId === application.id) && !restricted(note.stageId);

/**
 * Checks every chosen candidate: an open application of this job (no outcome yet) with consent given, reachable by the
 * actor (the repositories are scoped), with a CV to share when asked for one, and only notes about them that were not
 * written at a restricted stage. Anything
 * else is refused as a whole: a shortlist never goes out half-made.
 */
export async function prepareCandidates(
  deps: Pick<ShortlistDeps, 'applications' | 'candidates' | 'notes' | 'jobTeams'>,
  organizationId: string,
  jobId: string,
  choices: readonly CandidateChoice[],
): Promise<readonly PreparedCandidate[]> {
  const restricted = await restrictedStagesOf(deps.jobTeams, organizationId, jobId);
  const prepared: PreparedCandidate[] = [];
  for (const [index, choice] of choices.entries()) {
    const application = await deps.applications.findById(organizationId, choice.applicationId);
    if (!application || application.jobId !== jobId || application.outcome !== null || application.consentStatus !== 'given') {
      invalid(index, 'applicationId', 'not_presentable');
    }
    const open = application as Application;
    const candidate = await deps.candidates.findById(organizationId, open.candidateId);
    if (!candidate) return invalid(index, 'applicationId', 'not_presentable');
    if (choice.shareCv && (open.cv === null || open.cv.key === '')) invalid(index, 'shareCv', 'no_cv');
    const notes = choice.noteIds.length === 0 ? [] : await deps.notes.listByCandidate(organizationId, candidate.id);
    for (const noteId of choice.noteIds) {
      const note = notes.find((n) => n.id === noteId);
      if (!note || !shareableNote(note, open, restricted)) invalid(index, 'noteIds', 'unknown_note');
    }
    prepared.push({ application: open, candidate, shareCv: choice.shareCv, noteIds: [...new Set(choice.noteIds)] });
  }
  return prepared;
}
