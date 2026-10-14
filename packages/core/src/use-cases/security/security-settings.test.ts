import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../errors.js';
import { createInMemoryAuditLog } from '../../testing/in-memory-audit-log.js';
import { createInMemorySecuritySettings } from '../../testing/in-memory-security-settings.js';
import { createInMemoryTransaction } from '../../testing/in-memory-transaction.js';
import { userActor } from '../../testing/actors.js';
import { ORG_A, ORG_B } from '../../testing/candidate-seed.js';
import type { SecurityDeps } from '../../security-ports.js';
import { getSecuritySettings, setSecuritySettings } from './security-settings.js';

const deps = (): SecurityDeps & { auditLog: ReturnType<typeof createInMemoryAuditLog> } => ({
  auditLog: createInMemoryAuditLog(),
  transaction: createInMemoryTransaction(),
  securitySettings: createInMemorySecuritySettings(),
  now: () => new Date('2026-10-14T10:00:00Z'),
});

describe('security settings', () => {
  it('defaults to no 2FA requirement, readable by any member', async () => {
    const d = deps();
    const interviewer = userActor({ id: 'u_i', role: 'interviewer', organizationId: ORG_A });
    expect(await getSecuritySettings(d, interviewer, {})).toEqual({ requireTwoFactor: false });
  });

  it('lets owners and admins require 2FA, audited, per organization', async () => {
    const d = deps();
    const admin = userActor({ id: 'u_a', role: 'admin', organizationId: ORG_A });
    expect(await setSecuritySettings(d, admin, { requireTwoFactor: true })).toEqual({ requireTwoFactor: true });
    expect(await getSecuritySettings(d, admin, {})).toEqual({ requireTwoFactor: true });
    expect(await getSecuritySettings(d, userActor({ id: 'u_b', role: 'owner', organizationId: ORG_B }), {})).toEqual({ requireTwoFactor: false });
    expect(d.auditLog.events()[0]).toMatchObject({ action: 'organization.security_setting_updated', metadata: { requireTwoFactor: true } });
  });

  it('refuses recruiters', async () => {
    const recruiter = userActor({ id: 'u_r', role: 'recruiter', organizationId: ORG_A });
    await expect(setSecuritySettings(deps(), recruiter, { requireTwoFactor: true })).rejects.toThrow(ForbiddenError);
  });
});
