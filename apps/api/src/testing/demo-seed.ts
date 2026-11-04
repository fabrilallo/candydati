import type { DemoContext } from '../demo-seed/dataset.js';

/** A fixed context for the tests of the seed: secrets are predictable here and only here. */
export const testContext = (overrides: Partial<DemoContext> = {}): DemoContext => {
  let counter = 0;
  return {
    organizationId: 'org_demo',
    owner: { id: 'user_owner', name: 'Giulia Rossi', email: 'giulia.rossi@demo.example.com' },
    notice: { id: 'notice_1', version: 1, retentionDays: { selection: 365, talent_pool: 730 } },
    now: new Date('2026-11-04T10:00:00.000Z'),
    secret: () => {
      counter += 1;
      return `secret-${counter}`;
    },
    ...overrides,
  };
};
