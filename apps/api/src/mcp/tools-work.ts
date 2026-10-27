import {
  addCandidateNote,
  createTask,
  getJobStats,
  listAttention,
  listJobTemplates,
  toAttentionItemDtos,
  toJobTemplateDto,
  toNoteDto,
} from '@candydati/core';
import { ATTENTION_STATES, NOTE_MAX, TASK_TITLE_MAX } from '@candydati/domain';
import { z } from 'zod';
import { toTaskResponse } from '../routes/task-view.js';
import { withoutSurname } from './privacy.js';
import type { ToolDefinition } from './tool-support.js';

export const listAttentionTool = {
  name: 'list_attention',
  title: 'Applications that need an answer',
  description:
    'Open applications whose promised answer is due within 48 hours or overdue, most urgent first, with the candidate\'s first name and id, job, stage and owner. ' +
    'Read only: answering, moving or deciding on a candidate stays with a person.',
  shape: {
    state: z.enum(ATTENTION_STATES).optional(),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  },
  readOnly: true,
  run: async ({ app, actor }, input) => {
    const page = await listAttention(app.candidateDeps, actor, input);
    const items = toAttentionItemDtos(page).map((item) => ({ ...item, candidate: withoutSurname(item.candidate) }));
    return { items, meta: { total: page.total, page: page.page, limit: page.limit } };
  },
} satisfies ToolDefinition<{ state: z.ZodOptional<z.ZodEnum<{ due_soon: 'due_soon'; overdue: 'overdue' }>>; page: z.ZodOptional<z.ZodNumber>; limit: z.ZodOptional<z.ZodNumber> }>;

export const addCandidateNoteTool = {
  name: 'add_candidate_note',
  title: 'Add a note on a candidate',
  description:
    'Add an internal note to a candidate, optionally about one application. The note is visible to the team only and is attributed to the person who owns the key. ' +
    'It does not message the candidate, and does not move or decide anything.',
  shape: {
    candidateId: z.string().min(1),
    body: z.string().min(1).max(NOTE_MAX),
    applicationId: z.string().min(1).optional().describe('An application of this candidate the note is about.'),
  },
  readOnly: false,
  run: async ({ app, actor }, input) => toNoteDto(await addCandidateNote(app.candidateDeps, actor, input)),
} satisfies ToolDefinition<{ candidateId: z.ZodString; body: z.ZodString; applicationId: z.ZodOptional<z.ZodString> }>;

export const createTaskTool = {
  name: 'create_task',
  title: 'Create a follow-up task',
  description:
    'Create a follow-up task for a member of the team, optionally about an application or a job, with an optional due date. ' +
    'A task is a reminder for a person: it does not message or decide on anyone.',
  shape: {
    title: z.string().min(1).max(TASK_TITLE_MAX),
    assigneeId: z.string().min(1).describe('A member of the organization (user id).'),
    applicationId: z.string().min(1).optional(),
    jobId: z.string().min(1).optional(),
    dueAt: z.iso.datetime().optional(),
  },
  readOnly: false,
  run: async ({ app, actor }, input) => {
    const task = await toTaskResponse(app.taskDeps, actor.organizationId, await createTask(app.taskDeps, actor, input));
    return { ...task, candidate: withoutSurname(task.candidate) };
  },
} satisfies ToolDefinition<{ title: z.ZodString; assigneeId: z.ZodString; applicationId: z.ZodOptional<z.ZodString>; jobId: z.ZodOptional<z.ZodString>; dueAt: z.ZodOptional<z.ZodISODateTime> }>;

export const listJobTemplatesTool = {
  name: 'list_job_templates',
  title: 'List job ad templates',
  description: 'List the organization\'s job ad templates, to start a draft from with create_job (templateId). Read only.',
  shape: {},
  readOnly: true,
  run: async ({ app, actor }) => (await listJobTemplates(app.jobDeps, actor, {})).map(toJobTemplateDto),
} satisfies ToolDefinition<Record<string, never>>;

export const getJobStatsTool = {
  name: 'get_job_stats',
  title: 'Job ad statistics',
  description: 'Aggregates over the organization\'s job ads: counts by status, weekly activity, quality scores (none while the instance has no AI model: quality.available is false), declared salaries and processes, and what blocks drafts from publication. Read only.',
  shape: {},
  readOnly: true,
  run: async ({ app, actor }) => getJobStats(app.jobDeps, actor, {}),
} satisfies ToolDefinition<Record<string, never>>;
