import { z } from 'zod';
import { CONSENT_SCOPES, CONSENT_STATUSES } from '../candidate/privacy.js';
import { isoDate } from './common.js';
import { publicPrivacyNoticeSchema } from './privacy.js';

/** Fields of a candidate or application that came from an import (`to_renew`: waiting for the candidate's reconfirmation). */
export const importedFields = {
  consentStatus: z.enum(CONSENT_STATUSES),
  importBatchId: z.string().nullable(),
};

/** A card of the board: an imported application is erased at `retentionExpiresAt` unless the person reconfirms. */
export const cardConsentFields = { ...importedFields, retentionExpiresAt: isoDate };

/** Consent of an application. A `to_renew` one has no version, no scopes and no date: nothing was agreed. */
export const applicationConsentSchema = z.object({
  status: z.enum(CONSENT_STATUSES),
  privacyNoticeVersion: z.number().int().positive().nullable(),
  scopes: z.array(z.enum(CONSENT_SCOPES)),
  givenAt: isoDate.nullable(),
});
export type ApplicationConsentDto = z.infer<typeof applicationConsentSchema>;

/** `ConsentRequestDto`: the public reconfirmation page. */
export const publicConsentSchema = z.object({
  organization: z.object({ name: z.string(), slug: z.string() }),
  job: z.object({ title: z.string() }),
  privacyNotice: publicPrivacyNoticeSchema,
  expiresAt: isoDate,
});
export type PublicConsentDto = z.infer<typeof publicConsentSchema>;

/** `ConsentAnswerResult`. */
export const consentAnswerSchema = z.object({ status: z.enum(['reconfirmed', 'declined']) });
