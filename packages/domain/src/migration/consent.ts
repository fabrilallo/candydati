import { retentionExpiry, type ConsentScope, type PrivacyNotice } from '../candidate/privacy.js';
import type { MigrationCandidate } from './package.js';

/** `given`: a consent date came across; `to_renew`: none, the reconfirmation of ADR 0008 applies; `expired`: left out. */
export type MigrationConsentBucket = 'given' | 'to_renew' | 'expired';

export interface MigrationConsentDecision {
  readonly bucket: MigrationConsentBucket;
  readonly givenAt: Date | null;
  /** null for `to_renew`, and for `given` when neither the source nor a notice says how long it lasts. */
  readonly expiresAt: Date | null;
}

/** The minimal scope: `selection` is always part of an application's consent. */
const DEFAULT_SCOPES: readonly ConsentScope[] = ['selection'];

/**
 * Consent carries over (ADR 0009, decision 2): same controller, same legal basis. A date in the source keeps its
 * original `givenAt`; retention ends at the source expiry, else at the longest retention of the organization's active
 * notice among the consented scopes (`selection` when the source names none). A retention already over is `expired`:
 * the person is left out, a migration must not bring back data that should have been erased.
 */
export function migrationConsentOf(
  candidate: Pick<MigrationCandidate, 'consent'>,
  notice: Pick<PrivacyNotice, 'retentionDays'> | null,
  now: Date,
): MigrationConsentDecision {
  const { consent } = candidate;
  if (consent === undefined) return { bucket: 'to_renew', givenAt: null, expiresAt: null };
  const givenAt = new Date(consent.givenAt);
  const scopes = consent.scopes !== undefined && consent.scopes.length > 0 ? consent.scopes : DEFAULT_SCOPES;
  const expiresAt =
    consent.expiresAt !== undefined ? new Date(consent.expiresAt) : notice === null ? null : retentionExpiry({ scopes, givenAt }, notice);
  const expired = expiresAt !== null && expiresAt.getTime() <= now.getTime();
  return { bucket: expired ? 'expired' : 'given', givenAt, expiresAt };
}
