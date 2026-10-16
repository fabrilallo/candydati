import { z } from 'zod';
import { DAY_MS } from '../response/response-state.js';
import { SUPPORTED_LOCALES } from '../platform/config.js';

/**
 * Consent scopes (PRODUCT.md §6). `selection`: only the position applied for. `talent_pool`: also future positions of
 * the same organization. They are separate choices; `selection` is always required to apply.
 */
export const CONSENT_SCOPES = ['selection', 'talent_pool'] as const;
export type ConsentScope = (typeof CONSENT_SCOPES)[number];

/**
 * `given`: the candidate consented through our form (or reconfirmed). `to_renew`: imported data, never consented through
 * our form; visible only in the pipeline of its import job until the candidate reconfirms (PRODUCT.md §6).
 */
export const CONSENT_STATUSES = ['given', 'to_renew'] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export const RETENTION_MIN_DAYS = 30;
export const RETENTION_MAX_DAYS = 365 * 5;
/** Defaults proposed in the privacy settings; the organization (data controller) decides. */
export const DEFAULT_RETENTION_DAYS: Readonly<Record<ConsentScope, number>> = { selection: 365, talent_pool: 730 };

export const PRIVACY_TEXT_MAX = 20_000;

const retentionDays = z.number().int().min(RETENTION_MIN_DAYS).max(RETENTION_MAX_DAYS);

/** What an admin writes. Every save creates a new immutable version; old versions stay readable forever. */
export const privacyNoticeInputSchema = z.object({
  language: z.enum(SUPPORTED_LOCALES),
  /** Plain text with blank-line paragraphs. Rendered escaped, never as HTML. */
  text: z.string().trim().min(200).max(PRIVACY_TEXT_MAX),
  /** Who candidates contact to exercise their rights (PRODUCT.md §6). */
  contactEmail: z.email(),
  retentionDays: z.object({ selection: retentionDays, talent_pool: retentionDays }),
});
export type PrivacyNoticeInput = z.infer<typeof privacyNoticeInputSchema>;

export interface PrivacyNotice extends PrivacyNoticeInput {
  readonly id: string;
  readonly organizationId: string;
  /** 1, 2, 3... per organization. The highest is the active one. */
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: Date;
}

/**
 * Stored on every application: what the candidate agreed to, against which text, when. For a `to_renew` application
 * (see `Application.consentStatus`) nothing was agreed: `scopes` is empty, `privacyNoticeId` is '' and
 * `privacyNoticeVersion` is 0; `givenAt` is when the reconfirmation was requested.
 */
export interface ConsentRecord {
  readonly privacyNoticeId: string;
  readonly privacyNoticeVersion: number;
  readonly scopes: readonly ConsentScope[];
  readonly givenAt: Date;
  /**
   * `migration`: carried over from the organization's previous ATS (ADR 0009, same controller): `givenAt` is the date the
   * source recorded and `sourceSystem` names it. A reconfirmation replaces the whole record, so it loses this mark.
   */
  readonly origin?: 'migration' | undefined;
  readonly sourceSystem?: string | undefined;
}

/** The longest retention among the consented scopes, counted from the moment consent is given. */
export function retentionExpiry(consent: Pick<ConsentRecord, 'scopes' | 'givenAt'>, notice: Pick<PrivacyNotice, 'retentionDays'>): Date {
  if (consent.scopes.length === 0) throw new Error('retentionExpiry needs at least one consent scope');
  const days = Math.max(...consent.scopes.map((scope) => notice.retentionDays[scope]));
  return new Date(consent.givenAt.getTime() + days * DAY_MS);
}
