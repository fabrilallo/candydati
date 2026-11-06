import { createHmac } from 'node:crypto';

/**
 * Keyed hash of a profile key or email for objections: HMAC-SHA256 with the instance secret and the organization, so the
 * table says nothing about who objected and the same person hashes differently in each organization.
 */
export const createSourcingFingerprint =
  (secret: string) =>
  (organizationId: string, value: string): string =>
    createHmac('sha256', secret).update(`sourcing-objection\u0000${organizationId}\u0000${value}`).digest('hex');
