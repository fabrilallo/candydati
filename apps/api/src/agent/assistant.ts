import { Agent } from '@mastra/core/agent';
import type { AgentModel } from './model.js';
import { buildInstructions } from './instructions.js';
import { readPageContext } from './request-context.js';
import type { AgentTools } from './tools/index.js';

export const ASSISTANT_AGENT_ID = 'assistant';
/** Tool calls per turn: enough to read a job, check it and draft; a loop stops here. */
export const MAX_STEPS = 8;

export interface AssistantDeps {
  /** The assistant model in force, resolved at each call, or a mock model in tests. */
  readonly model: AgentModel;
  readonly tools: AgentTools;
  readonly productName: string;
  readonly now?: () => Date;
}

export const createAssistantAgent = ({ model, tools, productName, now = () => new Date() }: AssistantDeps) =>
  new Agent({
    id: ASSISTANT_AGENT_ID,
    name: 'Assistant',
    description: 'Helps a recruiter with job ads, the pipeline, answers owed to candidates, message drafts and tasks. Never ranks or decides on people.',
    instructions: ({ requestContext }) =>
      buildInstructions({ productName, page: readPageContext(requestContext), today: now().toISOString().slice(0, 10) }),
    model,
    tools,
    defaultOptions: { maxSteps: MAX_STEPS },
  });
