import { test as base, expect } from '@playwright/test';
import { isolateClient } from './client';

export const test = base.extend({
  context: async ({ context }, use) => {
    await isolateClient(context);
    await use(context);
    await context.unrouteAll({ behavior: 'ignoreErrors' });
  },
});

export { expect };
