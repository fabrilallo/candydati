import { z } from 'zod';
import { SOURCED_CONTACT_STATUSES, SOURCING_OUTCOMES, SOURCING_SOURCES, sourcingEvidenceSchema } from '../sourcing/sourcing.js';
import { isoDate } from './common.js';

/** A contact sourced for a job (`GET /jobs/:id/sourced-contacts`). Never a score; never the notice secret. */
export const sourcedContactSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  headline: z.string().nullable(),
  location: z.string().nullable(),
  source: z.enum(SOURCING_SOURCES),
  profileUrl: z.string(),
  email: z.string().nullable(),
  evidence: z.array(sourcingEvidenceSchema),
  status: z.enum(SOURCED_CONTACT_STATUSES),
  noticeSentAt: isoDate.nullable(),
  contactedAt: isoDate.nullable(),
  expiresAt: isoDate,
  createdBy: z.string(),
  createdAt: isoDate,
});
export type SourcedContactDto = z.output<typeof sourcedContactSchema>;

/** `POST /jobs/:id/sourced-contacts`: one result per person given, in order. `noticeUrl` only for `added`, only here. */
export const addSourcedResultSchema = z.object({
  profileUrl: z.string(),
  outcome: z.enum(SOURCING_OUTCOMES),
  contactId: z.string().nullable(),
  candidateId: z.string().nullable(),
  noticeUrl: z.string().nullable(),
});
export type AddSourcedResultDto = z.output<typeof addSourcedResultSchema>;

/** `POST /sourced-contacts/:id/notice`: the short notice to paste in a first message, with a fresh personal link. */
export const sourcedNoticeTextSchema = z.object({ text: z.string(), url: z.string() });

/** `GET /public/sourcing-notice/:token`: what the person sees about themselves. */
export const sourcingNoticeViewSchema = z.object({
  organizationName: z.string(),
  jobTitle: z.string(),
  language: z.enum(['it', 'en']),
  firstName: z.string(),
  lastName: z.string().nullable(),
  headline: z.string().nullable(),
  location: z.string().nullable(),
  source: z.enum(SOURCING_SOURCES),
  profileUrl: z.string(),
  email: z.string().nullable(),
  evidence: z.array(sourcingEvidenceSchema),
  collectedAt: isoDate,
  expiresAt: isoDate,
});
export type SourcingNoticeViewDto = z.output<typeof sourcingNoticeViewSchema>;
