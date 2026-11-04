import { z } from 'zod';
import type { MoveProposalRepository } from '../../proposal-ports.js';
import { defineSystemJob } from '../../use-case.js';

/**
 * Hourly system job (with `automation.scan`): open move proposals past their expiry become `expired`. Nothing moves. A
 * proposal read before this runs is already left out by its expiry date, so this only tidies the rows.
 */
export const expireMoveProposals = defineSystemJob<{ readonly moveProposals: MoveProposalRepository }, z.ZodObject<{ now: z.ZodDate }>, { readonly expired: number }>({
  name: 'expireMoveProposals',
  input: z.object({ now: z.date() }),
  handler: async ({ deps, input }) => ({ expired: await deps.moveProposals.expireDue(input.now) }),
});
