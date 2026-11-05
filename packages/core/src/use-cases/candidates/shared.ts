import { groupExtractedSkills, pipelineStagesOf, responseState, type Application, type Candidate, type CandidateNote } from '@candydati/domain';
import type { CandidateDeps } from '../../candidate-ports.js';
import { NotFoundError } from '../../errors.js';
import { requireJob } from '../jobs/shared.js';
import { loadSkillBook } from '../skills/skill-aliases.js';
import type { ApplicationCardView, CandidateDetailView, NoteView } from './views.js';
import { mapSequential, sequential } from '../../sequential.js';

const UNKNOWN_AUTHOR = 'Former member';

/** An application of another organization is indistinguishable from a missing one. */
export async function requireApplication(deps: Pick<CandidateDeps, 'applications'>, organizationId: string, id: string): Promise<Application> {
  const application = await deps.applications.findById(organizationId, id);
  if (!application) throw new NotFoundError('Application not found.');
  return application;
}

export async function requireCandidate(deps: Pick<CandidateDeps, 'candidates'>, organizationId: string, id: string): Promise<Candidate> {
  const candidate = await deps.candidates.findById(organizationId, id);
  if (!candidate) throw new NotFoundError('Candidate not found.');
  return candidate;
}

export async function loadCardView(deps: CandidateDeps, application: Application): Promise<ApplicationCardView> {
  const { organizationId } = application;
  const [candidate, extraction, counts, job] = await sequential(
    () => requireCandidate(deps, organizationId, application.candidateId),
    () => deps.extractions.findByApplication(organizationId, application.id),
    () => deps.notes.countByApplication(organizationId, [application.id]),
    () => requireJob(deps, organizationId, application.jobId),
  );
  const stageRemoved = !pipelineStagesOf(job.content.process).some((stage) => stage.id === application.stageId);
  return { application, candidate, extraction, noteCount: counts[application.id] ?? 0, stageRemoved, responseState: responseState(application, job, deps.now()) };
}

/** A member's current name; for a migrated note by someone who is not a member here, the name stored with it. */
const authorNameOf = (note: CandidateNote, names: Readonly<Record<string, string>>): string =>
  note.authorId === null ? (note.authorName ?? UNKNOWN_AUTHOR) : (names[note.authorId] ?? UNKNOWN_AUTHOR);

/** The restricted stages of the jobs given, as `jobId -> stage ids`. Without the team repository, none. */
export async function restrictedStagesOf(deps: Pick<CandidateDeps, 'jobTeams'>, organizationId: string, jobIds: readonly string[]): Promise<ReadonlyMap<string, readonly string[]>> {
  if (!deps.jobTeams || jobIds.length === 0) return new Map();
  const stages = (await deps.jobTeams.listRestrictedStages(organizationId)).filter((stage) => jobIds.includes(stage.jobId));
  return new Map(jobIds.map((jobId) => [jobId, stages.filter((stage) => stage.jobId === jobId).map((stage) => stage.stageId)]));
}

/** Is the note at a restricted stage of the job of its application? */
export const isRestrictedNote = (note: CandidateNote, jobOf: (applicationId: string) => string | undefined, restricted: ReadonlyMap<string, readonly string[]>): boolean => {
  if (note.applicationId === null || note.stageId === null) return false;
  const jobId = jobOf(note.applicationId);
  return jobId !== undefined && (restricted.get(jobId) ?? []).includes(note.stageId);
};

async function loadNotes(
  deps: CandidateDeps,
  candidate: Candidate,
  applications: readonly Application[],
  restricted: ReadonlyMap<string, readonly string[]>,
): Promise<readonly NoteView[]> {
  const notes = await deps.notes.listByCandidate(candidate.organizationId, candidate.id);
  const memberIds = [...new Set(notes.flatMap((n) => (n.authorId === null ? [] : [n.authorId])))];
  const names = await deps.users.namesOf(candidate.organizationId, memberIds);
  const jobOf = (applicationId: string) => applications.find((application) => application.id === applicationId)?.jobId;
  return notes.map((note) => ({ note, authorName: authorNameOf(note, names), restricted: isRestrictedNote(note, jobOf, restricted) }));
}

/**
 * Imported people who have not reconfirmed (`to_renew`) are visible only through the application of their import job:
 * everywhere else their applications do not exist. `viaJobId` is the job whose pipeline the viewer came from.
 */
export const isVisibleApplication = (application: Application, viaJobId: string | undefined): boolean =>
  application.consentStatus === 'given' || (viaJobId !== undefined && application.jobId === viaJobId);

export async function loadCandidateDetail(
  deps: CandidateDeps,
  candidate: Candidate,
  visible: (application: Application) => boolean = () => true,
): Promise<CandidateDetailView> {
  const { organizationId } = candidate;
  const applications = (await deps.applications.listByCandidate(organizationId, candidate.id)).filter(visible);
  const extractions = await deps.extractions.findByApplications(organizationId, applications.map((a) => a.id));
  const messageCounts = await deps.messages.countByApplication(organizationId, applications.map((a) => a.id));
  const attachments = await deps.applications.listAttachments(organizationId, applications.map((a) => a.id));
  const jobIds = [...new Set(applications.map((a) => a.jobId))];
  const jobs = await mapSequential(jobIds, (id) => requireJob(deps, organizationId, id));
  const restricted = await restrictedStagesOf(deps, organizationId, jobIds);
  const book = await loadSkillBook(deps, organizationId);
  return {
    candidate,
    applications: applications.map((application) => {
      const job = jobs.find((j) => j.id === application.jobId);
      if (!job) throw new NotFoundError('Job not found.');
      const extraction = extractions.find((e) => e.applicationId === application.id) ?? null;
      return {
        application,
        job,
        stages: pipelineStagesOf(job.content.process),
        extraction,
        skills: groupExtractedSkills(book, extraction?.data?.skills ?? []),
        messageCount: messageCounts[application.id] ?? 0,
        responseState: responseState(application, job, deps.now()),
        attachments: attachments.filter((attachment) => attachment.applicationId === application.id),
        restrictedStageIds: restricted.get(job.id) ?? [],
      };
    }),
    notes: await loadNotes(deps, candidate, applications, restricted),
  };
}
