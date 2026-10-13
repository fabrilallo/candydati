import type { Page } from '@playwright/test';
import { applyToJob, type Applicant } from './apply';
import { createPublishedJob, type PublishedJob } from './jobs';
import { publishPrivacyNotice } from './privacy';
import { newWorkspace, type Workspace } from './session';
import { token } from './unique';

export interface JobWorkspace extends Workspace {
  readonly job: PublishedJob;
}

/** A fresh user and organization with a privacy notice and one published job, all created through the UI. */
export const workspaceWithJob = async (page: Page, stages?: Parameters<typeof createPublishedJob>[1]['stages']): Promise<JobWorkspace> => {
  const workspace = await newWorkspace(page);
  await publishPrivacyNotice(page, workspace.owner.email);
  const spec = { title: `Backend Developer ${token()} (m/f/x)`, ...(stages ? { stages } : {}) };
  const job = await createPublishedJob(page, spec);
  return { ...workspace, job };
};

export const newApplicant = (label = 'cand'): Applicant => {
  const id = token();
  return { firstName: 'Giulia', lastName: `Test${id}`, email: `e2e-${label}-${id}@e2e.test` };
};

/** Applies from a clean (cookie-less) page; the caller keeps its own signed-in page for the recruiter. */
export const applyAs = async (candidatePage: Page, workspace: JobWorkspace, who: Applicant): Promise<void> =>
  applyToJob(candidatePage, workspace.org.slug, workspace.job.slug, who);
