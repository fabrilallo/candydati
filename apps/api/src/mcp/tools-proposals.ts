import { proposeApplicationMove } from '@candydati/core';
import { MOVE_PROPOSAL_REASON_MAX } from '@candydati/domain';
import { z } from 'zod';
import type { ToolDefinition } from './tool-support.js';

const proposeShape = {
  applicationId: z.string().min(1).describe('Id of the application, from get_pipeline or list_attention.'),
  toStageId: z.string().min(1).describe('A stage of the same job (stage ids from get_pipeline), other than the current one.'),
  reason: z
    .string()
    .min(1)
    .max(MOVE_PROPOSAL_REASON_MAX)
    .describe(`Why, in a sentence or two of plain text (max ${MOVE_PROPOSAL_REASON_MAX} characters), based on what the team recorded. Shown to people as written.`),
};

/**
 * The one MCP tool about moving a candidate, and it does not move: it writes a proposal that a person confirms (the
 * normal move, with their own permission) or dismisses, like a `propose_move` rule (PRODUCT.md §2.4, ADR 0005).
 */
export const proposeStageMoveTool = {
  name: 'propose_stage_move',
  title: 'Propose moving an application to another stage',
  description:
    'PROPOSE moving an application to another stage of the same job, with a short reason. This tool only proposes: it never moves, decides on or messages the candidate. ' +
    'The proposal waits in the team\'s attention list and on the application until a person confirms it (and then it is their move) or dismisses it; it lapses after 14 days or as soon as the application moves or is decided. ' +
    'Calling it again for the same target returns the proposal already waiting (created: false); while a proposal to another stage waits, a person must act on it first. ' +
    'Needs the candidate:propose_move scope (opt-in, on the API key or granted when connecting the app). Never propose on the basis of age, sex, origin or other protected characteristics.',
  shape: proposeShape,
  readOnly: false,
  run: async ({ app, actor }, input) => {
    const { proposal, created } = await proposeApplicationMove(app.proposalDeps, actor, input);
    return {
      proposalId: proposal.id,
      applicationId: proposal.applicationId,
      fromStageId: proposal.fromStageId,
      toStageId: proposal.toStageId,
      status: proposal.status,
      expiresAt: proposal.expiresAt.toISOString(),
      created,
      moved: false,
      next: 'Nothing has moved. A person confirms or dismisses this proposal in the app.',
    };
  },
} satisfies ToolDefinition<typeof proposeShape>;
