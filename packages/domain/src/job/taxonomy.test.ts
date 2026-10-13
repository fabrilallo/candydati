import { describe, expect, it } from 'vitest';
import { JOB_ROLE_FAMILIES, JOB_ROLES, type JobRole, familyOfRole, SENIORITY_LEVELS, WORK_MODES } from './taxonomy.js';

describe('JOB_ROLES', () => {
  it('has no duplicate ids across families', () => {
    expect(new Set(JOB_ROLES).size).toBe(JOB_ROLES.length);
  });

  it('is the flattened list of every family, in order', () => {
    expect(JOB_ROLES[0]).toBe('backend_developer');
    expect(JOB_ROLES).toHaveLength(Object.values(JOB_ROLE_FAMILIES).flat().length);
  });

  it('uses snake_case ids only', () => {
    for (const role of JOB_ROLES) {
      expect(role).toMatch(/^[a-z]+(_[a-z]+)*$/);
    }
  });
});

describe('familyOfRole', () => {
  it.each([
    ['backend_developer', 'engineering'],
    ['data_scientist', 'data'],
    ['product_owner', 'product'],
    ['recruiter', 'people'],
    ['chief_executive', 'leadership'],
  ] as const)('maps %s to the %s family', (role, family) => {
    expect(familyOfRole(role)).toBe(family);
  });

  it('places every role in exactly one family', () => {
    for (const role of JOB_ROLES) {
      const families = Object.entries(JOB_ROLE_FAMILIES).filter(([, roles]) => (roles as readonly JobRole[]).includes(role));
      expect(families).toHaveLength(1);
      expect(familyOfRole(role)).toBe(families[0]?.[0]);
    }
  });
});

describe('closed lists', () => {
  it('keeps the work modes and seniority levels of PLAN §5.1', () => {
    expect(WORK_MODES).toEqual(['remote', 'hybrid', 'onsite']);
    expect(SENIORITY_LEVELS).toContain('senior');
  });
});
