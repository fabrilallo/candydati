import { z } from 'zod';
import { isSafePersonName, NAME_MAX } from '../candidate/person-name.js';

/**
 * "Fill in with LinkedIn" on the public application form (Sign In with LinkedIn using OpenID Connect). The candidate has
 * no account: LinkedIn only fills the form, which the candidate reviews and sends. Only first name, last name and a
 * verified email are kept; photo, locale and the LinkedIn member id are discarded, and nothing is stored on the server.
 */
export const LINKEDIN_ROUTE_BASE = '/api/v1/public/linkedin';
/** The redirect URL to register in the LinkedIn app: `{PLATFORM_URL}` followed by this path. */
export const LINKEDIN_CALLBACK_PATH = `${LINKEDIN_ROUTE_BASE}/callback`;
/** Fragment the callback returns to: it tells the job page to ask for the prefill. Carries no personal data. */
export const LINKEDIN_RETURN_FRAGMENT = 'apply-linkedin';

const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const JOB_PAGE = new RegExp(`^/careers/${SLUG}/${SLUG}$`);
const RETURN_PATH_MAX = 200;
const EMAIL_MAX = 254;

/**
 * The only place the flow may send the browser back to: the path of a public job page of this site. Never an origin,
 * a query or a fragment, so the flow cannot be used as an open redirect.
 */
export const linkedInReturnPathOf = (value: unknown): string | null =>
  typeof value === 'string' && value.length <= RETURN_PATH_MAX && JOB_PAGE.test(value) ? value : null;

/** Where the "Fill in with LinkedIn" link of a job page points. */
export const linkedInStartPath = (organizationSlug: string, jobSlug: string): string =>
  `${LINKEDIN_ROUTE_BASE}/start?return=${encodeURIComponent(`/careers/${organizationSlug}/${jobSlug}`)}`;

export const linkedInPrefillSchema = z
  .object({
    firstName: z.string().max(NAME_MAX),
    lastName: z.string().max(NAME_MAX),
    email: z.email().max(EMAIL_MAX).nullable(),
  })
  .strict();
export type LinkedInPrefill = z.infer<typeof linkedInPrefillSchema>;

/** What the form receives once: the fields to fill, or why there are none (cancelled, failed, nothing pending). */
export const linkedInPrefillResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('filled'), prefill: linkedInPrefillSchema }).strict(),
  z.object({ status: z.literal('cancelled') }).strict(),
  z.object({ status: z.literal('failed') }).strict(),
  z.object({ status: z.literal('none') }).strict(),
]);
export type LinkedInPrefillResult = z.infer<typeof linkedInPrefillResultSchema>;

/** The claims of LinkedIn's userinfo the flow reads, already validated. Everything else is never read. */
export interface LinkedInClaims {
  readonly givenName: string | null;
  readonly familyName: string | null;
  readonly email: string | null;
  readonly emailVerified: boolean;
}

const nameOf = (value: string | null): string => {
  const name = (value ?? '').trim().slice(0, NAME_MAX).trim();
  return isSafePersonName(name) ? name : '';
};

const verifiedEmailOf = (claims: LinkedInClaims): string | null => {
  if (!claims.emailVerified || claims.email === null) return null;
  const email = claims.email.trim();
  return z.email().max(EMAIL_MAX).safeParse(email).success ? email : null;
};

/** The fields of the form LinkedIn may fill. A name that could carry a link stays empty: the candidate types it. */
export const toLinkedInPrefill = (claims: LinkedInClaims): LinkedInPrefill => ({
  firstName: nameOf(claims.givenName),
  lastName: nameOf(claims.familyName),
  email: verifiedEmailOf(claims),
});
