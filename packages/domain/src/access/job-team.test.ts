import { describe, expect, it } from 'vitest';
import {
  JOB_TEAM_ROLES,
  ORGANIZATION_SCOPE,
  hasOrganizationWideAccess,
  jobScopeIncludes,
  jobTeamMemberInputSchema,
  teamRoleFor,
} from './job-team.js';
import { ROLES } from './permissions.js';

describe('job team access', () => {
  it('gives owners and admins every job, always', () => {
    expect(hasOrganizationWideAccess('owner', { restrictRecruitersToTeam: true })).toBe(true);
    expect(hasOrganizationWideAccess('admin', { restrictRecruitersToTeam: true })).toBe(true);
  });

  it('gives recruiters every job unless the organization restricts them to their teams', () => {
    expect(hasOrganizationWideAccess('recruiter', { restrictRecruitersToTeam: false })).toBe(true);
    expect(hasOrganizationWideAccess('recruiter', { restrictRecruitersToTeam: true })).toBe(false);
  });

  it('never gives hiring managers or interviewers the whole organization', () => {
    for (const restrictRecruitersToTeam of [true, false]) {
      expect(hasOrganizationWideAccess('hiring_manager', { restrictRecruitersToTeam })).toBe(false);
      expect(hasOrganizationWideAccess('interviewer', { restrictRecruitersToTeam })).toBe(false);
    }
  });

  it('maps every organization role to a team role', () => {
    expect(ROLES.map(teamRoleFor)).toEqual(['recruiter', 'recruiter', 'recruiter', 'hiring_manager', 'interviewer']);
    for (const role of ROLES) expect(JOB_TEAM_ROLES).toContain(teamRoleFor(role));
  });

  it('includes a job in a scope only when listed, and every job in the organization scope', () => {
    expect(jobScopeIncludes(ORGANIZATION_SCOPE, 'job_x')).toBe(true);
    expect(jobScopeIncludes({ kind: 'jobs', jobIds: ['job_a'] }, 'job_a')).toBe(true);
    expect(jobScopeIncludes({ kind: 'jobs', jobIds: ['job_a'] }, 'job_b')).toBe(false);
    expect(jobScopeIncludes({ kind: 'jobs', jobIds: [] }, null)).toBe(false);
  });

  it('validates a member to add', () => {
    expect(jobTeamMemberInputSchema.safeParse({ userId: 'u1', role: 'interviewer' }).success).toBe(true);
    expect(jobTeamMemberInputSchema.safeParse({ userId: 'u1', role: 'owner' }).success).toBe(false);
    expect(jobTeamMemberInputSchema.safeParse({ userId: '', role: 'recruiter' }).success).toBe(false);
  });
});
