import { pipelineStagesOf, responseState } from '@candydati/domain';
import { z } from 'zod';
import { requireJob } from '../jobs/shared.js';
import { defineCandidateUseCase } from './define.js';
import type { PipelineView } from './views.js';
import { sequential } from '../../sequential.js';

/** Open and decided applications of one job, with the stages generated from its declared process. */
export const getPipeline = defineCandidateUseCase({
  name: 'getPipeline',
  input: z.object({ jobId: z.string().min(1) }),
  permission: 'candidate:read',
  audit: { skip: 'listing: opening a candidate profile or CV is what gets audited' },
  handler: async ({ deps, actor, input }): Promise<PipelineView> => {
    const job = await requireJob(deps, actor.organizationId, input.jobId);
    const applications = await deps.applications.listByJob(actor.organizationId, job.id);
    const ids = applications.map((a) => a.id);
    const [candidates, extractions, counts] = await sequential(
      () => deps.candidates.findByIds(actor.organizationId, [...new Set(applications.map((a) => a.candidateId))]),
      () => deps.extractions.findByApplications(actor.organizationId, ids),
      () => deps.notes.countByApplication(actor.organizationId, ids),
    );
    const now = deps.now();
    const pipeline = pipelineStagesOf(job.content.process);
    const cards = applications.flatMap((application) => {
      const candidate = candidates.find((c) => c.id === application.candidateId);
      if (!candidate) return [];
      const extraction = extractions.find((e) => e.applicationId === application.id) ?? null;
      const stageRemoved = !pipeline.some((stage) => stage.id === application.stageId);
      return [
        { application, candidate, extraction, noteCount: counts[application.id] ?? 0, stageRemoved, responseState: responseState(application, job, now) },
      ];
    });
    const stages = pipeline.map((stage) => ({
      stage,
      count: cards.filter((c) => c.application.outcome === null && c.application.stageId === stage.id).length,
    }));
    return { job, stages, cards };
  },
});
