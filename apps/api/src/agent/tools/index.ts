import type { CandidateDeps, JobDeps, MessagingDeps, ReportDeps, TaskDeps } from '@candydati/core';
import type { JobDrafter } from '../job-drafter.js';
import { createCreateTaskTool, createDraftMessageTool } from './action-tools.js';
import { createFindHelpRecipeTool } from './help-tools.js';
import { createCandidateBriefTool, createListAttentionTool, createPipelineSummaryTool } from './candidate-tools.js';
import { createReportsSummaryTool } from './report-tools.js';
import { createFindCandidatesTool } from './search-tools.js';
import {
  createAnalyzeJobAdTool,
  createDraftJobContentTool,
  createGetJobTool,
  createListJobTemplatesTool,
  createListJobsTool,
  createUpdateJobDraftTool,
} from './job-tools.js';

export interface AgentToolDeps {
  readonly jobDeps: JobDeps;
  readonly candidateDeps: CandidateDeps;
  readonly messagingDeps: MessagingDeps;
  readonly taskDeps: TaskDeps;
  readonly reportDeps: ReportDeps;
  readonly draftJob: JobDrafter;
  readonly onToolError?: ((error: unknown, tool: string) => void) | undefined;
}

/**
 * The assistant's tools, keyed by id (Mastra exposes the key as the function name). There is deliberately no tool to
 * publish or close an ad, move or decide on a candidate, send a message, erase data or rank anyone (the criteria search filters on what
 * a person confirmed, it does not score).
 */
export function createAgentTools(deps: AgentToolDeps) {
  const tools = [
    createGetJobTool(deps.jobDeps),
    createListJobsTool(deps.jobDeps),
    createListJobTemplatesTool(deps.jobDeps),
    createAnalyzeJobAdTool(deps.jobDeps),
    createDraftJobContentTool(deps.jobDeps, deps.draftJob, deps.onToolError),
    createUpdateJobDraftTool(deps.jobDeps),
    createPipelineSummaryTool(deps.candidateDeps),
    createListAttentionTool(deps.candidateDeps),
    createCandidateBriefTool(deps.candidateDeps, deps.messagingDeps),
    createFindCandidatesTool(deps.candidateDeps),
    createDraftMessageTool(deps.messagingDeps),
    createCreateTaskTool(deps.taskDeps),
    createReportsSummaryTool(deps.reportDeps),
    createFindHelpRecipeTool(),
  ];
  return Object.freeze(Object.fromEntries(tools.map((tool) => [tool.id, tool])));
}

export type AgentTools = ReturnType<typeof createAgentTools>;
