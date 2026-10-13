import type { DelegatedActor, SystemActor, UserActor } from '../actor.js';

const DEFAULT_ORGANIZATION = 'org_test';

export const userActor = (overrides: Partial<Omit<UserActor, 'type' | 'onBehalfOfUserId'>> = {}): UserActor => ({
  id: 'user_test',
  organizationId: DEFAULT_ORGANIZATION,
  role: 'owner',
  ...overrides,
  type: 'user',
  onBehalfOfUserId: null,
});

export const agentActor = (overrides: Partial<Omit<DelegatedActor, 'type'>> = {}): DelegatedActor => ({
  id: 'agent_test',
  onBehalfOfUserId: 'user_test',
  organizationId: DEFAULT_ORGANIZATION,
  role: 'owner',
  ...overrides,
  type: 'agent',
});

export const apiKeyActor = (overrides: Partial<Omit<DelegatedActor, 'type'>> = {}): DelegatedActor => ({
  ...agentActor({ id: 'key_test', ...overrides }),
  type: 'api_key',
});

export const systemActor = (overrides: Partial<Omit<SystemActor, 'type' | 'onBehalfOfUserId'>> = {}): SystemActor => ({
  id: null,
  organizationId: DEFAULT_ORGANIZATION,
  role: 'owner',
  ...overrides,
  type: 'system',
  onBehalfOfUserId: null,
});
