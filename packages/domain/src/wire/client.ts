import { z } from 'zod';
import { CLIENT_DISPLAYS } from '../client/client.js';
import { CLIENT_ANSWERS } from '../client/shortlist.js';
import { SUPPORTED_LOCALES } from '../platform/config.js';
import { isoDate } from './common.js';

/**
 * Clients of an agency and shortlists on the wire (PRODUCT.md §3.5). The api returns the core views as they are (Dates
 * become ISO strings in JSON); these schemas describe exactly `ClientView`, `JobClientView`, `ShortlistView` and
 * `PublicShortlistView`.
 */

export const agencySettingSchema = z.object({ recruitsForClients: z.boolean(), agencyAuthorization: z.string().nullable() });
export type AgencySettingDto = z.output<typeof agencySettingSchema>;

export const clientContactSchema = z.object({ id: z.string(), name: z.string(), email: z.string() });

export const clientSchema = z.object({
  id: z.string(),
  name: z.string(),
  website: z.string().nullable(),
  logoUrl: z.string().nullable(),
  /** Empty unless the reader manages clients or sends shortlists; `contactCount` is always there. */
  contacts: z.array(clientContactSchema),
  contactCount: z.number().int().nonnegative(),
  archived: z.boolean(),
  jobCount: z.number().int().nonnegative(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type ClientDto = z.output<typeof clientSchema>;

export const jobClientSchema = z.object({
  jobId: z.string(),
  client: z.object({ id: z.string(), name: z.string(), archived: z.boolean() }).nullable(),
  display: z.enum(CLIENT_DISPLAYS),
});
export type JobClientDto = z.output<typeof jobClientSchema>;

export const SHORTLIST_STATUSES = ['open', 'answered', 'expired', 'revoked'] as const;

export const shortlistItemSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  candidateName: z.string(),
  shareCv: z.boolean(),
  sharedNoteCount: z.number().int().nonnegative(),
  answer: z.enum(CLIENT_ANSWERS).nullable(),
  answerReason: z.string().nullable(),
  answeredAt: isoDate.nullable(),
  candidateNotified: z.boolean(),
});

/** What the recruiter sees of a shortlist: never the link, never its hash. */
export const shortlistSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  recipientName: z.string(),
  recipientEmail: z.string(),
  message: z.string().nullable(),
  status: z.enum(SHORTLIST_STATUSES),
  remindersSent: z.number().int().nonnegative(),
  firstOpenedAt: isoDate.nullable(),
  createdAt: isoDate,
  expiresAt: isoDate,
  revokedAt: isoDate.nullable(),
  items: z.array(shortlistItemSchema),
});
export type ShortlistDto = z.output<typeof shortlistSchema>;

export const publicShortlistCandidateSchema = z.object({
  itemId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  hasCv: z.boolean(),
  notes: z.array(z.object({ body: z.string(), at: isoDate })),
  answer: z.enum(CLIENT_ANSWERS).nullable(),
  answerReason: z.string().nullable(),
  answeredAt: isoDate.nullable(),
});
export type PublicShortlistCandidateDto = z.output<typeof publicShortlistCandidateSchema>;

/** What the client reads: only what the recruiter chose to share, no contact data and no internal ids of people. */
export const publicShortlistSchema = z.object({
  agencyName: z.string(),
  clientName: z.string(),
  recipientName: z.string(),
  jobTitle: z.string(),
  language: z.enum(SUPPORTED_LOCALES),
  message: z.string().nullable(),
  expiresAt: isoDate,
  candidates: z.array(publicShortlistCandidateSchema),
});
export type PublicShortlistDto = z.output<typeof publicShortlistSchema>;

/** The client of an ad on the public pages: by name, or confidential (no name, no website, no logo). */
export const publicJobClientSchema = z.object({
  display: z.enum(CLIENT_DISPLAYS),
  name: z.string().nullable(),
  website: z.string().nullable(),
  logo: z.string().nullable(),
  agencyAuthorization: z.string().nullable(),
});

export const jobListClientSchema = z.object({ id: z.string(), name: z.string(), display: z.enum(CLIENT_DISPLAYS) });
