import { pipelineStagesOf, responseState, type Application, type Candidate, type CandidateNote } from '@candydati/domain';
import type { CandidateDeps } from '../../candidate-ports.js';
import { NotFoundError } from '../../errors.js';
import { requireJob } from '../jobs/shared.js';
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

async function loadNotes(deps: CandidateDeps, candidate: Candidate): Promise<readonly NoteView[]> {
  const notes = await deps.notes.listByCandidate(candidate.organizationId, candidate.id);
  const memberIds = [...new Set(notes.flatMap((n) => (n.authorId === null ? [] : [n.authorId])))];
  const names = await deps.users.namesOf(candidate.organizationId, memberIds);
  return notes.map((note) => ({ note, authorName: authorNameOf(note, names) }));
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
  return {
    candidate,
    applications: applications.map((application) => {
      const job = jobs.find((j) => j.id === application.jobId);
      if (!job) throw new NotFoundError('Job not found.');
      return {
        application,
        job,
        stages: pipelineStagesOf(job.content.process),
        extraction: extractions.find((e) => e.applicationId === application.id) ?? null,
        messageCount: messageCounts[application.id] ?? 0,
        responseState: responseState(application, job, deps.now()),
        attachments: attachments.filter((attachment) => attachment.applicationId === application.id),
      };
    }),
    notes: await loadNotes(deps, candidate),
  };
}
