import { z } from 'zod';
import type { SourcingDeps } from '../../sourcing-ports.js';
import { defineSystemJob } from '../../use-case.js';

/** Daily (`retention.run`): contacts nobody answered are erased 30 days after they were collected. Counts only. */
export const eraseExpiredSourcedContacts = defineSystemJob<Pick<SourcingDeps, 'contacts'>, z.ZodObject<{ now: z.ZodDate }>, { readonly erased: number }>({
  name: 'eraseExpiredSourcedContacts',
  input: z.object({ now: z.date() }),
  handler: async ({ deps, input }) => ({ erased: await deps.contacts.deleteExpired(input.now) }),
});
