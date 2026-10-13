import { describe, expect, it } from 'vitest';
import { toAuditActor, type Actor } from './actor.js';

describe('toAuditActor', () => {
  it('maps a user', () => {
    const actor: Actor = { type: 'user', id: 'u1', onBehalfOfUserId: null, organizationId: 'o1', role: 'admin' };
    expect(toAuditActor(actor)).toEqual({ type: 'user', id: 'u1', onBehalfOfUserId: null });
  });

  it('keeps who an agent or api key acts for', () => {
    const agent: Actor = { type: 'agent', id: 'assistant', onBehalfOfUserId: 'u1', organizationId: 'o1', role: 'admin' };
    const key: Actor = { type: 'api_key', id: 'key1', onBehalfOfUserId: 'u2', organizationId: 'o1', role: 'recruiter' };
    expect(toAuditActor(agent)).toEqual({ type: 'agent', id: 'assistant', onBehalfOfUserId: 'u1' });
    expect(toAuditActor(key)).toEqual({ type: 'api_key', id: 'key1', onBehalfOfUserId: 'u2' });
  });

  it('does not leak organization or role into the audit actor', () => {
    const actor: Actor = { type: 'system', id: null, onBehalfOfUserId: null, organizationId: 'o1', role: 'owner' };
    expect(Object.keys(toAuditActor(actor)).sort()).toEqual(['id', 'onBehalfOfUserId', 'type']);
  });
});
