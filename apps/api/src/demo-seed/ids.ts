import { createHash } from 'node:crypto';

/**
 * The id of a row the demo seed creates: a UUID (version 8, RFC 9562) derived from the organization and a key that names
 * the row inside the dataset. Stable across runs, so a rerun finds what it created and never duplicates it; different per
 * organization, because primary keys are global. Only ids: secrets (link tokens) are always random.
 */
export function demoId(organizationId: string, key: string): string {
  const hex = createHash('sha256').update(`candydati-demo-seed\u0000${organizationId}\u0000${key}`).digest('hex');
  const variant = ((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
