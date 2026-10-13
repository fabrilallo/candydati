import { Mastra } from '@mastra/core';
import type { MastraModelConfig } from '@mastra/core/llm';
import type { AppContext } from '../app-context.js';
import { ASSISTANT_AGENT_ID, createAssistantAgent } from './assistant.js';
import { createModelJobDrafter, type JobDrafter } from './job-drafter.js';
import { createAgentTools } from './tools/index.js';

export type AgentContext = Pick<AppContext, 'env' | 'jobDeps' | 'candidateDeps' | 'messagingDeps' | 'taskDeps' | 'reportDeps'>;

export interface RuntimeOptions {
  readonly model: MastraModelConfig;
  /** Defaults to a structured-output call on the agent model. */
  readonly draftJob?: JobDrafter | undefined;
  /** Server-side log of a tool failure the model only sees as a short code. */
  readonly onToolError?: ((error: unknown, tool: string) => void) | undefined;
}

/** The Mastra instance with the assistant and its tools wired to the same core deps as the REST routes. */
export function createAgentRuntime(ctx: AgentContext, { model, draftJob, onToolError }: RuntimeOptions): Mastra {
  const tools = createAgentTools({
    jobDeps: ctx.jobDeps,
    candidateDeps: ctx.candidateDeps,
    messagingDeps: ctx.messagingDeps,
    taskDeps: ctx.taskDeps,
    reportDeps: ctx.reportDeps,
    draftJob: draftJob ?? createModelJobDrafter(model),
    onToolError,
  });
  const agent = createAssistantAgent({ model, tools, productName: ctx.env.platform.name });
  return new Mastra({ agents: { [ASSISTANT_AGENT_ID]: agent }, logger: false });
}
