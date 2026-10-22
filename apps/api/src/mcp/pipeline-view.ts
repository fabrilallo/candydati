import type { PipelineView } from '@candydati/core';
import type { JobStatus, ResponseState } from '@candydati/domain';

/**
 * What the MCP `get_pipeline` returns: first names, stage and response state, and nothing a candidate wrote (no
 * surname, message, CV text, headline or tags). An external agent reads where everyone stands, not who they are.
 */
export interface McpPipeline {
  readonly job: { readonly id: string; readonly title: string; readonly status: JobStatus };
  readonly stages: readonly { readonly id: string; readonly title: string; readonly type: string | null; readonly openCount: number }[];
  readonly applications: readonly {
    readonly applicationId: string;
    readonly candidateId: string;
    readonly firstName: string;
    readonly stageId: string;
    readonly stageRemoved: boolean;
    readonly outcome: string | null;
    readonly responseState: ResponseState;
    readonly responseDueAt: string | null;
  }[];
}

export const toMcpPipeline = (view: PipelineView): McpPipeline => ({
  job: { id: view.job.id, title: view.job.content.title, status: view.job.status },
  stages: view.stages.map(({ stage, count }) => ({
    id: stage.id,
    title: stage.declared ? (stage.declared.title ?? stage.declared.type) : 'received',
    type: stage.declared?.type ?? null,
    openCount: count,
  })),
  applications: view.cards.map(({ application, candidate, stageRemoved, responseState }) => ({
    applicationId: application.id,
    candidateId: candidate.id,
    firstName: candidate.firstName,
    stageId: application.stageId,
    stageRemoved,
    outcome: application.outcome,
    responseState,
    responseDueAt: application.responseDueAt ? application.responseDueAt.toISOString() : null,
  })),
});
