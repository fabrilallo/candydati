import { z } from 'zod';

/**
 * A shortlist presented to a client (PRODUCT.md §3.5): the recruiter picks candidates of a client job, chooses what to
 * share of each one (the CV or not, which notes) and sends one contact of the client a personal, expiring link. The
 * client answers per candidate "meet at interview" or "not for us" with a short reason. An answer is an opinion for
 * the recruiter: it never moves a stage or decides an application (principle 4).
 */
export const SHORTLIST_TOKEN_TTL_DAYS = 14;
/** Days after sending at which a reminder goes out while some candidate is still unanswered. */
export const SHORTLIST_REMINDER_DAYS = [3, 7] as const;
export const SHORTLIST_CANDIDATES_MAX = 20;
export const SHORTLIST_NOTES_PER_CANDIDATE_MAX = 5;
export const SHORTLIST_MESSAGE_MAX = 1000;
export const SHORTLIST_REASON_MIN = 3;
export const SHORTLIST_REASON_MAX = 500;

export const CLIENT_ANSWERS = ['meet', 'not_for_us'] as const;
export type ClientAnswer = (typeof CLIENT_ANSWERS)[number];

export interface ClientShortlist {
  readonly id: string;
  readonly organizationId: string;
  readonly jobId: string;
  readonly clientId: string;
  /** The contact it was sent to, copied at sending time: editing the client later does not rewrite it. */
  readonly recipientContactId: string;
  readonly recipientName: string;
  readonly recipientEmail: string;
  /** sha256 of the secret in the link. The secret itself is never stored. */
  readonly tokenHash: string;
  readonly message: string | null;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly remindersSent: number;
  readonly lastReminderAt: Date | null;
  readonly firstOpenedAt: Date | null;
  readonly createdBy: string;
  readonly createdAt: Date;
}

export interface ClientShortlistItem {
  readonly id: string;
  readonly organizationId: string;
  readonly shortlistId: string;
  readonly applicationId: string;
  readonly position: number;
  readonly shareCv: boolean;
  /** Notes the recruiter chose to show; a note erased since is simply not shown. */
  readonly sharedNoteIds: readonly string[];
  readonly answer: ClientAnswer | null;
  readonly answerReason: string | null;
  readonly answeredAt: Date | null;
  /** When the candidate was told their profile was shared (null if the email could not be queued). */
  readonly candidateNotifiedAt: Date | null;
}

export type ShortlistStatus = 'open' | 'answered' | 'expired' | 'revoked';

export function shortlistStatus(shortlist: Pick<ClientShortlist, 'expiresAt' | 'revokedAt'>, items: readonly Pick<ClientShortlistItem, 'answer'>[], now: Date): ShortlistStatus {
  if (shortlist.revokedAt !== null) return 'revoked';
  if (items.length > 0 && items.every((item) => item.answer !== null)) return 'answered';
  return shortlist.expiresAt <= now ? 'expired' : 'open';
}

export const shortlistCandidateInputSchema = z.strictObject({
  applicationId: z.string().min(1),
  shareCv: z.boolean().default(false),
  noteIds: z.array(z.string().min(1)).max(SHORTLIST_NOTES_PER_CANDIDATE_MAX).default([]),
});

export const shortlistInputSchema = z.strictObject({
  jobId: z.string().min(1),
  contactId: z.string().min(1),
  message: z
    .string()
    .trim()
    .max(SHORTLIST_MESSAGE_MAX)
    .optional()
    .transform((value) => (value ? value : null)),
  candidates: z
    .array(shortlistCandidateInputSchema)
    .min(1)
    .max(SHORTLIST_CANDIDATES_MAX)
    .refine((candidates) => new Set(candidates.map((c) => c.applicationId)).size === candidates.length, { message: 'duplicate_candidate' }),
});
export type ShortlistInput = z.input<typeof shortlistInputSchema>;

export const shortlistAnswerSchema = z.strictObject({
  itemId: z.string().min(1).max(64),
  answer: z.enum(CLIENT_ANSWERS),
  reason: z.string().trim().min(SHORTLIST_REASON_MIN).max(SHORTLIST_REASON_MAX),
});

/** Public path of the shortlist page; the link is `${platformUrl}${path}`. */
export const shortlistPath = (token: string): string => `/shortlist/${token}`;

/**
 * Equality of two strings whose time does not depend on where they differ. Used on top of the lookup by hash, so the
 * comparison of a secret never leaks a prefix.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
