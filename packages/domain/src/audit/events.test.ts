import { describe, expect, it } from 'vitest';
import { newAuditEventSchema } from './events.js';

const base = {
  organizationId: 'org_1',
  actor: { type: 'user', id: 'user_1' },
  action: 'invitation.created',
  target: { type: 'invitation', id: 'inv_1' },
} as const;

describe('newAuditEventSchema', () => {
  it('fills the defaults', () => {
    const event = newAuditEventSchema.parse(base);
    expect(event.metadata).toEqual({});
    expect(event.actor.onBehalfOfUserId).toBeNull();
  });

  it('keeps who an agent acts for', () => {
    const event = newAuditEventSchema.parse({
      ...base,
      actor: { type: 'agent', id: 'process-assistant', onBehalfOfUserId: 'user_1' },
    });
    expect(event.actor).toEqual({ type: 'agent', id: 'process-assistant', onBehalfOfUserId: 'user_1' });
  });

  it('rejects unknown actions and missing organizations', () => {
    expect(newAuditEventSchema.safeParse({ ...base, action: 'candidate.ranked' }).success).toBe(false);
    expect(newAuditEventSchema.safeParse({ ...base, organizationId: '' }).success).toBe(false);
  });
});
