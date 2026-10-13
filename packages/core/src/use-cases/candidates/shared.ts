import { pipelineStagesOf, type Application, type Candidate } from '@tt/domain';
import type { CandidateDeps } from '../../candidate-ports.js';
import { NotFoundError } from '../../errors.js';
import { requireJob } from '../jobs/shared.js';
import type { ApplicationCardView, CandidateDetailView, NoteView } from './views.js';

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
  const [candidate, extraction, counts, job] = await Promise.all([
    requireCandidate(deps, organizationId, application.candidateId),
    deps.extractions.findByApplication(organizationId, application.id),
    deps.notes.countByApplication(organizationId, [application.id]),
    requireJob(deps, organizationId, application.jobId),
  ]);
  const stageRemoved = !pipelineStagesOf(job.content.process).some((stage) => stage.id === application.stageId);
  return { application, candidate, extraction, noteCount: counts[application.id] ?? 0, stageRemoved };
}

async function loadNotes(deps: CandidateDeps, candidate: Candidate): Promise<readonly NoteView[]> {
  const notes = await deps.notes.listByCandidate(candidate.organizationId, candidate.id);
  const names = await deps.users.namesOf(candidate.organizationId, [...new Set(notes.map((n) => n.authorId))]);
  return notes.map((note) => ({ note, authorName: names[note.authorId] ?? UNKNOWN_AUTHOR }));
}

export async function loadCandidateDetail(deps: CandidateDeps, candidate: Candidate): Promise<CandidateDetailView> {
  const { organizationId } = candidate;
  const applications = await deps.applications.listByCandidate(organizationId, candidate.id);
  const extractions = await deps.extractions.findByApplications(organizationId, applications.map((a) => a.id));
  const messageCounts = await deps.messages.countByApplication(organizationId, applications.map((a) => a.id));
  const jobIds = [...new Set(applications.map((a) => a.jobId))];
  const jobs = await Promise.all(jobIds.map((id) => requireJob(deps, organizationId, id)));
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
      };
    }),
    notes: await loadNotes(deps, candidate),
  };
}
