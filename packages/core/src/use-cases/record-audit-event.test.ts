import { describe, expect, it } from 'vitest';
import { AuditWriteError, ForbiddenError, ValidationError } from '../errors.js';
import { createInMemoryAuditLog, failingAuditLog, userActor } from '../testing/index.js';
import { recordAuditEvent } from './record-audit-event.js';

const input = {
  organizationId: 'o1',
  action: 'invitation.created',
  target: { type: 'invitation', id: 'inv1' },
  metadata: { role: 'recruiter' },
};

describe('recordAuditEvent', () => {
  it('appends the event once, with the calling actor', async () => {
    const auditLog = createInMemoryAuditLog();
    const actor = userActor({ role: 'admin', organizationId: 'o1' });
    await recordAuditEvent({ auditLog }, actor, input);
    const events = auditLog.events();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ ...input, actor: { type: 'user', id: actor.id } });
  });

  it('works for a member whose role has no admin permission (the mutation was authorized by Better Auth)', async () => {
    const auditLog = createInMemoryAuditLog();
    await recordAuditEvent({ auditLog }, userActor({ role: 'interviewer', organizationId: 'o1' }), {
      ...input,
      action: 'invitation.accepted',
    });
    expect(auditLog.events()).toHaveLength(1);
  });

  it('refuses an event for another organization', async () => {
    const auditLog = createInMemoryAuditLog();
    const actor = userActor({ role: 'owner', organizationId: 'o2' });
    await expect(recordAuditEvent({ auditLog }, actor, input)).rejects.toBeInstanceOf(ForbiddenError);
    expect(auditLog.events()).toHaveLength(0);
  });

  it('cannot forge the actor or record audit.read', async () => {
    const auditLog = createInMemoryAuditLog();
    const actor = userActor({ role: 'admin', organizationId: 'o1' });
    await recordAuditEvent({ auditLog }, actor, { ...input, actor: { type: 'system', id: null } });
    expect(auditLog.events()[0]!.actor.type).toBe('user');
    await expect(recordAuditEvent({ auditLog }, actor, { ...input, action: 'audit.read' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('validates the event', async () => {
    const auditLog = createInMemoryAuditLog();
    const actor = userActor({ role: 'admin', organizationId: 'o1' });
    await expect(recordAuditEvent({ auditLog }, actor, { ...input, action: 'nope' })).rejects.toBeInstanceOf(ValidationError);
    await expect(recordAuditEvent({ auditLog }, actor, { ...input, target: { type: '', id: '' } })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(auditLog.events()).toHaveLength(0);
  });

  it('fails loudly when the append fails', async () => {
    const actor = userActor({ role: 'admin', organizationId: 'o1' });
    await expect(recordAuditEvent({ auditLog: failingAuditLog(new Error('x')) }, actor, input)).rejects.toBeInstanceOf(
      AuditWriteError,
    );
  });

  it('defaults metadata to empty', async () => {
    const auditLog = createInMemoryAuditLog();
    const { metadata: _omitted, ...bare } = input;
    await recordAuditEvent({ auditLog }, userActor({ role: 'admin', organizationId: 'o1' }), bare);
    expect(auditLog.events()[0]!.metadata).toEqual({});
  });
});
