import { createTool } from '@mastra/core/tools';
import { createTask, renderMessageDraft, type MessagingDeps, type TaskDeps } from '@candydati/core';
import { TASK_TITLE_MAX } from '@candydati/domain';
import { z } from 'zod';
import { readAgentIdentity } from '../request-context.js';
import { runTool } from '../tool-result.js';

export const DRAFT_SUBJECT_MAX = 200;
export const DRAFT_BODY_MAX = 5000;

const id = z.string().min(1).max(100);

/**
 * Renders a draft for one application and hands it to the UI, where the person reads it and presses send: the agent
 * never sends (`message:send` is forbidden to it). The rendering runs as the agent (`message:read`, same organization),
 * so a person who cannot send still gets the text; it stores and sends nothing.
 */
export const createDraftMessageTool = (deps: MessagingDeps) =>
  createTool({
    id: 'draft_message',
    description:
      'Prepares a message to the candidate of one application and shows it to the user as a DRAFT with a send button. It does NOT send anything: only the user can send it. Subject and body may use template variables such as {{candidate.firstName}}, {{candidate.lastName}}, {{job.title}}, {{organization.name}}; {{candidate.lastName}} stays a variable in the result and is filled in by the composer.',
    inputSchema: z.object({
      applicationId: id,
      subject: z.string().trim().min(1).max(DRAFT_SUBJECT_MAX),
      body: z.string().trim().min(1).max(DRAFT_BODY_MAX),
    }),
    execute: async (input, context) =>
      runTool(async () => {
        const { actor } = readAgentIdentity(context?.requestContext);
        const preview = await renderMessageDraft(deps, actor, input);
        return { status: 'draft_not_sent' as const, applicationId: input.applicationId, subject: preview.subject, body: preview.body, unknownVariables: preview.unknownVariables };
      }),
  });

/** Always assigned to the person the agent works for: the agent does not hand work to colleagues. */
export const createCreateTaskTool = (deps: TaskDeps) =>
  createTool({
    id: 'create_task',
    description: 'Creates a follow-up task assigned to the user, optionally linked to an application or a job, with an optional due date (ISO 8601).',
    inputSchema: z.object({
      title: z.string().trim().min(1).max(TASK_TITLE_MAX),
      applicationId: id.optional(),
      jobId: id.optional(),
      dueAt: z.iso.datetime({ offset: true }).optional(),
    }),
    execute: async (input, context) =>
      runTool(async () => {
        const { actor } = readAgentIdentity(context?.requestContext);
        const task = await createTask(deps, actor, { ...input, assigneeId: actor.onBehalfOfUserId });
        return { created: true, taskId: task.id, title: task.title, dueAt: task.dueAt?.toISOString() ?? null };
      }),
  });
