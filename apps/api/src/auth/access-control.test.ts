import { ROLES, ROLE_GRANTS, STATEMENTS } from '@tt/domain';
import { describe, expect, it } from 'vitest';
import { buildAccessControl } from './access-control.js';

describe('buildAccessControl', () => {
  const { ac, roles } = buildAccessControl();

  it('builds exactly the domain roles', () => {
    expect(Object.keys(roles).sort()).toEqual([...ROLES].sort());
  });

  it('gives each role the domain grants', () => {
    for (const role of ROLES) expect(roles[role].statements).toEqual(ROLE_GRANTS[role]);
  });

  it('covers every permission Better Auth checks for organizations, members and invitations', () => {
    expect(STATEMENTS.organization).toEqual(expect.arrayContaining(['update', 'delete']));
    expect(STATEMENTS.member).toEqual(expect.arrayContaining(['create', 'update', 'delete']));
    expect(STATEMENTS.invitation).toEqual(expect.arrayContaining(['create', 'cancel']));
    expect(ac.statements).toEqual(STATEMENTS);
  });

  it('lets owners and admins invite and recruiters not', () => {
    const can = (role: (typeof ROLES)[number]) => roles[role].authorize({ invitation: ['create'] }).success;
    expect([can('owner'), can('admin'), can('recruiter'), can('hiring_manager'), can('interviewer')]).toEqual([true, true, false, false, false]);
  });
});
