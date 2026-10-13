import {
  ATTENTION_STATES,
  CONSENT_SCOPES,
  CONSENT_STATUSES,
  EXTRACTION_STATUSES,
  JOB_STATUSES,
  NOTIFICATION_KINDS,
  OUTCOMES,
  RESPONSE_STATES,
  cvExtractionSchema,
  jobStatsDtoSchema,
  selectionStageSchema,
} from '@tt/domain';
import type {
  ApplicationCardDto,
  AttentionItemDto,
  CandidateDetailDto,
  CandidateSummaryDto,
  NoteDto,
  NotificationDto,
  PipelineDto,
  TaskDto,
} from '@tt/core';
import { z } from 'zod';

const isoDate = z.iso.datetime();
const person = z.object({ id: z.string(), firstName: z.string(), lastName: z.string() });
const consentStatus = z.enum(CONSENT_STATUSES);
const importBatchId = z.string().nullable();
const stage = z.object({ id: z.string(), declared: selectionStageSchema.nullable() });

export const applicationCardSchema: z.ZodType<ApplicationCardDto> = z.object({
  id: z.string(),
  jobId: z.string(),
  stageId: z.string(),
  outcome: z.enum(OUTCOMES).nullable(),
  createdAt: isoDate,
  stageChangedAt: isoDate,
  closedAt: isoDate.nullable(),
  responseDueAt: isoDate.nullable(),
  respondedAt: isoDate.nullable(),
  responseState: z.enum(RESPONSE_STATES),
  noteCount: z.number().int(),
  consentStatus,
  importBatchId,
  retentionExpiresAt: isoDate,
  stageRemoved: z.boolean(),
  candidate: person.extend({
    tags: z.array(z.string()),
    headline: z.string().nullable(),
    location: z.string().nullable(),
    yearsOfExperience: z.number().int().nullable(),
  }),
});

export const pipelineSchema: z.ZodType<PipelineDto> = z.object({
  job: z.object({ id: z.string(), title: z.string(), status: z.enum(JOB_STATUSES) }),
  stages: z.array(stage.extend({ count: z.number().int() })),
  applications: z.array(applicationCardSchema),
});

export const candidateSummarySchema: z.ZodType<CandidateSummaryDto> = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  tags: z.array(z.string()),
  talentPool: z.boolean(),
  consentStatus,
  importBatchId,
  applicationCount: z.number().int(),
  lastAppliedAt: isoDate.nullable(),
  retentionExpiresAt: isoDate,
});

export const noteSchema: z.ZodType<NoteDto> = z.object({
  id: z.string(),
  applicationId: z.string().nullable(),
  author: z.object({ id: z.string(), name: z.string() }),
  body: z.string(),
  createdAt: isoDate,
});

export const candidateDetailSchema: z.ZodType<CandidateDetailDto> = z.object({
  candidate: person.extend({
    email: z.string(),
    phone: z.string().nullable(),
    linkedinUrl: z.string().nullable(),
    tags: z.array(z.string()),
    talentPool: z.boolean(),
    consentStatus,
    importBatchId,
    retentionExpiresAt: isoDate,
    createdAt: isoDate,
  }),
  applications: z.array(
    z.object({
      id: z.string(),
      job: z.object({ id: z.string(), title: z.string(), slug: z.string() }),
      stageId: z.string(),
      stageRemoved: z.boolean(),
      stages: z.array(stage),
      outcome: z.enum(OUTCOMES).nullable(),
      message: z.string(),
      createdAt: isoDate,
      stageChangedAt: isoDate,
      closedAt: isoDate.nullable(),
      responseDueAt: isoDate.nullable(),
      respondedAt: isoDate.nullable(),
      responseState: z.enum(RESPONSE_STATES),
      consent: z.object({ status: consentStatus, privacyNoticeVersion: z.number().int().nullable(), scopes: z.array(z.enum(CONSENT_SCOPES)), givenAt: isoDate.nullable() }),
      importBatchId,
      retentionExpiresAt: isoDate,
      cv: z.object({ fileName: z.string(), mediaType: z.string(), sizeBytes: z.number().int() }),
      extraction: z.object({
        status: z.enum(EXTRACTION_STATUSES),
        data: cvExtractionSchema.nullable(),
        source: z.enum(['model', 'text']).nullable(),
      }),
      messageCount: z.number().int(),
    }),
  ),
  notes: z.array(noteSchema),
});

export const attentionItemSchema: z.ZodType<AttentionItemDto> = z.object({
  applicationId: z.string(),
  candidate: person,
  job: z.object({ id: z.string(), title: z.string() }),
  stage: z.object({ id: z.string(), label: z.string().nullable() }),
  responseDueAt: isoDate,
  state: z.enum(ATTENTION_STATES),
  ownerName: z.string(),
});

export const taskSchema: z.ZodType<TaskDto> = z.object({
  id: z.string(),
  title: z.string(),
  applicationId: z.string().nullable(),
  jobId: z.string().nullable(),
  assignee: z.object({ id: z.string(), name: z.string() }),
  candidate: person.nullable(),
  jobTitle: z.string().nullable(),
  dueAt: isoDate.nullable(),
  createdBy: z.string(),
  createdAt: isoDate,
  completedAt: isoDate.nullable(),
});

export const notificationSchema: z.ZodType<NotificationDto> = z.object({
  id: z.string(),
  kind: z.enum(NOTIFICATION_KINDS),
  applicationId: z.string().nullable(),
  jobId: z.string().nullable(),
  taskId: z.string().nullable(),
  payload: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  candidate: person.nullable(),
  jobTitle: z.string().nullable(),
  createdAt: isoDate,
  readAt: isoDate.nullable(),
});

export const jobStatsSchema = jobStatsDtoSchema;
