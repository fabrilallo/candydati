import type { AuditEvent } from '@candydati/domain';
import { describe, expect, it } from 'vitest';
import { toAuditEventDto, userActorIds } from './audit-dto.js';

const event = (overrides: Partial<AuditEvent> = {}): AuditEvent => ({
  id: 'e1',
  organizationId: 'o1',
  actor: { type: 'user', id: 'u1', onBehalfOfUserId: null },
  action: 'member.added',
  target: { type: 'member', id: 'm1' },
  metadata: { role: 'recruiter' },
  occurredAt: new Date('2026-01-02T03:04:05.678Z'),
  ...overrides,
});

describe('toAuditEventDto', () => {
  it('maps the event, resolves the user name and serializes the date as ISO', () => {
    expect(toAuditEventDto(event(), new Map([['u1', 'Ada']]))).toEqual({
      id: 'e1',
      organizationId: 'o1',
      actor: { type: 'user', id: 'u1', onBehalfOfUserId: null, name: 'Ada' },
      action: 'member.added',
      target: { type: 'member', id: 'm1' },
      metadata: { role: 'recruiter' },
      occurredAt: '2026-01-02T03:04:05.678Z',
    });
  });

  it('has a null name when the user no longer exists', () => {
    expect(toAuditEventDto(event(), new Map()).actor.name).toBeNull();
  });

  it('has a null name for actors that are not users, even if the id collides with a user', () => {
    const agent = event({ actor: { type: 'agent', id: 'u1', onBehalfOfUserId: 'u2' } });
    expect(toAuditEventDto(agent, new Map([['u1', 'Ada']])).actor).toMatchObject({ name: null, onBehalfOfUserId: 'u2' });
    const system = event({ actor: { type: 'system', id: null, onBehalfOfUserId: null } });
    expect(toAuditEventDto(system, new Map()).actor).toMatchObject({ id: null, name: null });
  });
});

describe('userActorIds', () => {
  it('lists distinct user ids only', () => {
    const events = [
      event(),
      event({ id: 'e2' }),
      event({ id: 'e3', actor: { type: 'user', id: 'u2', onBehalfOfUserId: null } }),
      event({ id: 'e4', actor: { type: 'agent', id: 'a1', onBehalfOfUserId: 'u1' } }),
      event({ id: 'e5', actor: { type: 'system', id: null, onBehalfOfUserId: null } }),
    ];
    expect(userActorIds(events)).toEqual(['u1', 'u2']);
  });
});
