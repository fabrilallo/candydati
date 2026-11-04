import { describe, expect, it } from 'vitest';
import { apiKeyActor, userActor } from '../../testing/actors.js';
import { createInMemoryAuditLog } from '../../testing/in-memory-audit-log.js';
import { createInMemoryConnectedApps } from '../../testing/in-memory-connected-apps.js';
import { createInMemoryTransaction } from '../../testing/in-memory-transaction.js';
import { listConnectedApps, recordConnectedAppGrant, revokeConnectedApp } from './connected-apps.js';

const NOW = new Date('2026-11-04T10:00:00.000Z');
const ORG = 'org_test';

function setup() {
  const connectedApps = createInMemoryConnectedApps();
  const grant = (id: string, userId: string, organizationId = ORG, at = NOW) => ({ id, organizationId, clientId: `client_${id}`, clientName: 'Claude', clientUri: 'https://claude.ai', userId, scopes: ['mcp'], createdAt: at, updatedAt: at });
  connectedApps.addGrant(grant('mine', 'user_test', ORG, new Date(NOW.getTime() - 1000)));
  connectedApps.addGrant(grant('theirs', 'user_other'));
  connectedApps.addGrant(grant('elsewhere', 'user_test', 'org_other'));
  connectedApps.addToken({ hash: 'h1', organizationId: ORG, clientId: 'client_mine', userId: 'user_test', scopes: ['mcp'], resources: [], expiresAt: NOW });
  const deps = { auditLog: createInMemoryAuditLog(), transaction: createInMemoryTransaction(), connectedApps };
  return { deps, connectedApps };
}

const recruiter = userActor({ role: 'recruiter' });
const admin = userActor({ id: 'user_admin', role: 'admin' });

describe('listConnectedApps', () => {
  it('shows a person their own apps in this organization', async () => {
    const { deps } = setup();
    expect((await listConnectedApps(deps, recruiter, {})).map((g) => g.id)).toEqual(['mine']);
  });

  it('shows owners and admins every app connected in the organization, newest first', async () => {
    const { deps } = setup();
    expect((await listConnectedApps(deps, admin, {})).map((g) => g.id)).toEqual(['theirs', 'mine']);
  });

  it('is for people only: a key or an app never lists connections', async () => {
    const { deps } = setup();
    await expect(listConnectedApps(deps, apiKeyActor(), {})).rejects.toMatchObject({ name: 'ForbiddenError' });
  });
});

describe('revokeConnectedApp', () => {
  it('revokes one of my apps with its tokens and audits it', async () => {
    const { deps, connectedApps } = setup();
    const revoked = await revokeConnectedApp(deps, recruiter, { grantId: 'mine' });
    expect(revoked.id).toBe('mine');
    expect(connectedApps.grants().map((g) => g.id)).toEqual(['theirs', 'elsewhere']);
    expect(connectedApps.tokens()).toEqual([]);
    expect(deps.auditLog.events()).toMatchObject([
      { action: 'connected_app.revoked', organizationId: ORG, target: { type: 'connected_app', id: 'mine' }, metadata: { clientId: 'client_mine', clientName: 'Claude', userId: 'user_test' } },
    ]);
  });

  it("does not reveal or touch someone else's app to a member, but lets an admin revoke it", async () => {
    const { deps, connectedApps } = setup();
    await expect(revokeConnectedApp(deps, recruiter, { grantId: 'theirs' })).rejects.toMatchObject({ name: 'NotFoundError' });
    await expect(revokeConnectedApp(deps, recruiter, { grantId: 'elsewhere' })).rejects.toMatchObject({ name: 'NotFoundError' });
    expect(connectedApps.grants()).toHaveLength(3);
    await revokeConnectedApp(deps, admin, { grantId: 'theirs' });
    expect(connectedApps.grants().map((g) => g.id)).toEqual(['mine', 'elsewhere']);
  });

  it('validates the input', async () => {
    const { deps } = setup();
    await expect(revokeConnectedApp(deps, recruiter, { grantId: '' })).rejects.toMatchObject({ name: 'ValidationError' });
  });
});

describe('recordConnectedAppGrant', () => {
  it('audits the connection the person just granted, in the organization they picked', async () => {
    const { deps } = setup();
    const grant = await recordConnectedAppGrant(deps, recruiter, { clientId: 'client_mine' });
    expect(grant.id).toBe('mine');
    expect(deps.auditLog.events()).toMatchObject([
      { action: 'connected_app.granted', actor: { type: 'user', id: 'user_test' }, target: { type: 'connected_app', id: 'mine' }, metadata: { clientId: 'client_mine', clientName: 'Claude', scopes: ['mcp'] } },
    ]);
  });

  it('fails when there is no such grant (nothing is audited)', async () => {
    const { deps } = setup();
    await expect(recordConnectedAppGrant(deps, recruiter, { clientId: 'client_theirs' })).rejects.toMatchObject({ name: 'NotFoundError' });
    expect(deps.auditLog.events()).toEqual([]);
  });
});
