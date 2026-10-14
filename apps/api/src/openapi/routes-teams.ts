import { JOB_TEAM_ROLES } from '@tt/domain';
import { z } from 'zod';
import type { RouteSpec } from './spec.js';

const jobTeamSchema = z.object({
  jobId: z.string(),
  members: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
      email: z.string(),
      role: z.enum(JOB_TEAM_ROLES),
      source: z.enum(['team', 'stage_interviewer']),
      stageIds: z.array(z.string()),
      removable: z.boolean(),
      addedAt: z.iso.datetime().nullable(),
    }),
  ),
});
const accessSettingSchema = z.object({ restrictRecruitersToTeam: z.boolean() });

const TEAM_NOTE =
  'Hiring managers and interviewers (and recruiters, when the organization restricts them) see the candidates of a job only when they are on its team. Stage interviewers are members implicitly.';

export const teamRoutes: readonly RouteSpec[] = [
  { method: 'get', path: '/api/v1/jobs/:id/team', tag: 'Jobs', summary: 'Team of a job', description: TEAM_NOTE, scope: 'job_team:read', response: { schema: jobTeamSchema } },
  {
    method: 'put', path: '/api/v1/jobs/:id/team/:userId', tag: 'Jobs', summary: 'Add a member to the team of a job, or change their role', scope: 'job_team:manage', sessionOnly: true,
    description: 'The member must belong to the organization. Who sees which candidates is decided by a person: API keys and the assistant cannot change a team.',
    body: z.object({ role: z.enum(JOB_TEAM_ROLES) }), response: { schema: jobTeamSchema },
  },
  {
    method: 'delete', path: '/api/v1/jobs/:id/team/:userId', tag: 'Jobs', summary: 'Remove a member from the team of a job', scope: 'job_team:manage', sessionOnly: true,
    description: 'Stage interviewers stay members until they are removed from the stage.', response: { schema: z.object({ removed: z.boolean() }) },
  },
  { method: 'get', path: '/api/v1/settings/access', tag: 'Jobs', summary: 'Are recruiters restricted to their teams', scope: 'job:read', response: { schema: accessSettingSchema } },
  {
    method: 'put', path: '/api/v1/settings/access', tag: 'Jobs', summary: 'Restrict recruiters to their teams, or not', scope: 'organization:update', sessionOnly: true,
    body: accessSettingSchema, response: { schema: accessSettingSchema },
  },
];
