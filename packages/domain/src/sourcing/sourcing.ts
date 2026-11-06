import { z } from 'zod';
import { DAY_MS } from '../response/response-state.js';
import { httpUrlSchema } from '../url/http-url.js';

/** The WHATWG URL parser, present in browsers and Node; declared here because this package loads no DOM or Node types. */
declare const URL: new (input: string) => { readonly hostname: string; readonly pathname: string };

/**
 * Sourcing: people found outside Candydati (a LinkedIn or GitHub profile, a web page) for a job. They did not apply, so
 * they are contacts, never candidates: the data is kept for SOURCED_CONTACT_RETENTION_DAYS, they are told where it came
 * from (GDPR art. 14) and can have it erased and never be added again. No score, no ranking: evidence per criterion only.
 */
export const SOURCING_SOURCES = ['linkedin', 'github', 'web', 'manual'] as const;
export type SourcingSource = (typeof SOURCING_SOURCES)[number];

/** `found`: collected; `notified`: the art. 14 notice went out; `contacted`: a person wrote to them. */
export const SOURCED_CONTACT_STATUSES = ['found', 'notified', 'contacted'] as const;
export type SourcedContactStatus = (typeof SOURCED_CONTACT_STATUSES)[number];

/** Art. 14(3)(a): at most a month before the person must be told; unanswered contacts are erased then. */
export const SOURCED_CONTACT_RETENTION_DAYS = 30;
export const MAX_SOURCED_PER_CALL = 50;
export const MAX_EVIDENCE = 20;

export const contactExpiry = (collectedAt: Date): Date => new Date(collectedAt.getTime() + SOURCED_CONTACT_RETENTION_DAYS * DAY_MS);

/** Hosts whose profile is the first path segment (after `in/` on LinkedIn): the rest of the path is a sub-page. */
const PROFILE_DEPTH: Readonly<Record<string, number>> = { 'linkedin.com': 2, 'github.com': 1, 'gitlab.com': 1 };

/**
 * One key per profile, however the link was written: no scheme, `www.` or country subdomain of LinkedIn, query, fragment
 * or trailing slash, lowercase; LinkedIn and GitHub cut to the profile itself. Null for what is not an http(s) link.
 */
export function normalizeProfileUrl(value: string): string | null {
  const parsed = httpUrlSchema.safeParse(value.trim());
  if (!parsed.success) return null;
  const url = new URL(parsed.data);
  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^[a-z]{2}\.linkedin\.com$/, 'linkedin.com');
  const segments = url.pathname.toLowerCase().split('/').filter(Boolean);
  const depth = PROFILE_DEPTH[host];
  const path = (depth === undefined ? segments : segments.slice(0, depth)).join('/');
  return path === '' ? host : `${host}/${path}`;
}

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional().transform((value) => (value ? value : null));

/** Why the person may fit: a criterion of the job and what the source says about it, with where (section, repository). */
export const sourcingEvidenceSchema = z.object({ criterion: text(80), text: text(500), where: optionalText(120) }).strict();
export type SourcingEvidence = z.output<typeof sourcingEvidenceSchema>;

export const sourcedContactInputSchema = z
  .object({
    firstName: text(80),
    lastName: optionalText(80),
    headline: optionalText(200),
    location: optionalText(120),
    source: z.enum(SOURCING_SOURCES),
    profileUrl: httpUrlSchema.max(500).refine((value) => normalizeProfileUrl(value) !== null, { message: 'invalid_profile_url' }),
    /** Rare: only when the source shows it publicly. With it, the art. 14 notice is emailed at once. */
    email: z.email().max(254).nullable().optional().transform((value) => value?.toLowerCase() ?? null),
    evidence: z.array(sourcingEvidenceSchema).max(MAX_EVIDENCE).default([]),
  })
  .strict();
export type SourcedContactInput = z.input<typeof sourcedContactInputSchema>;
export type SourcedContactData = z.output<typeof sourcedContactInputSchema>;

export interface SourcedContact extends SourcedContactData {
  readonly id: string;
  readonly organizationId: string;
  readonly jobId: string;
  /** `normalizeProfileUrl` of `profileUrl`: one contact per profile and job. */
  readonly profileKey: string;
  readonly status: SourcedContactStatus;
  /** Hash of the secret of the personal notice link (the secret is only in the notice). */
  readonly noticeTokenHash: string;
  readonly noticeSentAt: Date | null;
  readonly contactedAt: Date | null;
  readonly expiresAt: Date;
  readonly createdBy: string;
  readonly createdAt: Date;
}

/** What happened to one person given to `addSourcedContacts`. */
export const SOURCING_OUTCOMES = ['added', 'already_contact', 'already_candidate', 'objected'] as const;
export type SourcingOutcome = (typeof SOURCING_OUTCOMES)[number];
