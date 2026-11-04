import { DEMO_CAREERS_DOCUMENT } from '../content/careers.js';
import { BACKEND_JOB, DESIGNER_JOB, FRONTEND_DRAFT } from '../content/jobs-company.js';
import { CLIENT_DATA_JOB, CLOSED_CUSTOMER_JOB } from '../content/jobs-other.js';
import type { DemoJobSpec } from '../content/types.js';
import type { DemoContext, DemoDataset } from '../dataset.js';
import { planApplicants } from './applicants.js';
import { buildApplications } from './applications.js';
import { buildClient, buildNotes, buildTasks, buildTemplates } from './extras.js';
import { buildFeedback } from './feedback.js';
import { buildJobs } from './jobs.js';
import { precomputedQualities } from './quality.js';

/** The five ads of the demo: three published (one for a client), one closed with a hire, one draft. */
export const DEMO_JOBS: readonly DemoJobSpec[] = [BACKEND_JOB, DESIGNER_JOB, CLIENT_DATA_JOB, CLOSED_CUSTOMER_JOB, FRONTEND_DRAFT];

/** Everything the demo writes for one organization. Deterministic apart from link secrets (`ctx.secret`). */
export async function buildDemoDataset(ctx: DemoContext, specs: readonly DemoJobSpec[] = DEMO_JOBS): Promise<DemoDataset> {
  const jobs = buildJobs(ctx, specs, await precomputedQualities(specs));
  const applicants = planApplicants(ctx, specs);
  const { cvFiles, ...applications } = buildApplications(ctx, applicants);
  const feedback = buildFeedback(ctx, applicants, jobs.interviewers, jobs.criteria);
  return {
    rows: {
      ...jobs,
      criteria: feedback.criteria,
      templates: buildTemplates(ctx),
      ...buildClient(ctx, applicants, jobs.jobClients),
      ...applications,
      notes: buildNotes(ctx, applicants, jobs.restrictions),
      feedbackRequests: feedback.feedbackRequests,
      feedbacks: feedback.feedbacks,
      tasks: buildTasks(ctx, applicants),
    },
    cvFiles,
    careersPage: DEMO_CAREERS_DOCUMENT,
  };
}
