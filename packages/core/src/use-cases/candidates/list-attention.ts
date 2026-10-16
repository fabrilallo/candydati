import { ATTENTION_STATES, DUE_SOON_HOURS, HOUR_MS, responseState, type AttentionState, type Application, type Candidate, type Job } from '@candydati/domain';
import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../list-audit-log.js';
import { stageName } from '../messaging/shared.js';
import { defineCandidateUseCase } from './define.js';

export interface AttentionItemView {
  readonly application: Application;
  readonly candidate: Candidate;
  readonly job: Job;
  readonly stageLabel: string | null;
  readonly state: AttentionState;
  readonly ownerName: string;
}

export interface AttentionPage {
  readonly items: readonly AttentionItemView[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

const UNKNOWN_OWNER = 'Former member';

/**
 * Open applications whose answer is due within 48 hours or overdue, most urgent first: the view that stops anyone from
 * staying without an outcome unnoticed. Listing only: opening a profile is what gets audited.
 */
export const listAttention = defineCandidateUseCase({
  name: 'listAttention',
  input: z.object({
    state: z.enum(ATTENTION_STATES).optional(),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  }),
  permission: 'candidate:read',
  audit: { skip: 'listing: opening a candidate profile or CV is what gets audited' },
  handler: async ({ deps, actor, input }): Promise<AttentionPage> => {
    const { organizationId } = actor;
    const now = deps.now();
    const awaiting = await deps.applications.listAwaitingResponse(organizationId, new Date(now.getTime() + DUE_SOON_HOURS * HOUR_MS));
    const jobs = new Map<string, Job>();
    for (const jobId of new Set(awaiting.map((a) => a.jobId))) {
      const job = await deps.jobs.findById(organizationId, jobId);
      if (job) jobs.set(jobId, job);
    }
    const flagged = awaiting.flatMap((application) => {
      const job = jobs.get(application.jobId);
      const state = job ? responseState(application, job, now) : null;
      return job && (state === 'due_soon' || state === 'overdue') && (input.state === undefined || input.state === state)
        ? [{ application, job, state }]
        : [];
    });
    const start = (input.page - 1) * input.limit;
    const pageRows = flagged.slice(start, start + input.limit);
    const candidates = await deps.candidates.findByIds(organizationId, [...new Set(pageRows.map((r) => r.application.candidateId))]);
    const owners = await deps.users.namesOf(organizationId, [...new Set(pageRows.map((r) => r.job.createdBy))]);
    const items = pageRows.flatMap(({ application, job, state }) => {
      const candidate = candidates.find((c) => c.id === application.candidateId);
      if (!candidate) return [];
      const label = stageName(job, application.stageId);
      return [{ application, candidate, job, state, stageLabel: label === '' ? null : label, ownerName: owners[job.createdBy] ?? UNKNOWN_OWNER }];
    });
    return { items, total: flagged.length, page: input.page, limit: input.limit };
  },
});
