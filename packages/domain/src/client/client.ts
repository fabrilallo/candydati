import { z } from 'zod';
import { httpsUrlSchema, httpUrlSchema } from '../url/http-url.js';

/**
 * Clients of an agency (PRODUCT.md §3.5). An organization that recruits for clients (staffing and search agencies,
 * headhunters, consultants) keeps them inside its own organization: one talent pool, one team, many clients. A job may
 * belong to one client; nothing about clients exists for an organization that has not turned the setting on.
 */
export const CLIENT_NAME_MAX = 120;
export const CLIENT_CONTACTS_MAX = 10;
export const CLIENT_CONTACT_NAME_MAX = 120;
export const AGENCY_AUTHORIZATION_MAX = 200;

/** How a client job shows its client to candidates: by name, or as "a client of the agency" (never a different name). */
export const CLIENT_DISPLAYS = ['named', 'confidential'] as const;
export type ClientDisplay = (typeof CLIENT_DISPLAYS)[number];

/** One of the client's hiring contacts: the person a shortlist is sent to. */
export interface ClientContact {
  readonly id: string;
  readonly name: string;
  /** Lowercase. */
  readonly email: string;
}

export interface Client {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly website: string | null;
  /** An https address only: the browser loads it, the server never fetches it. */
  readonly logoUrl: string | null;
  readonly contacts: readonly ClientContact[];
  /** Archived clients keep their jobs and history but cannot get new jobs. */
  readonly archivedAt: Date | null;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** The link between a job and its client. Lives apart from the job, so saving a job never touches it. */
export interface JobClientLink {
  readonly organizationId: string;
  readonly jobId: string;
  readonly clientId: string;
  readonly display: ClientDisplay;
  readonly updatedBy: string;
  readonly updatedAt: Date;
}

const optionalUrl = (schema: typeof httpUrlSchema) =>
  z
    .union([schema, z.literal(''), z.null()])
    .optional()
    .transform((value) => (value === undefined || value === '' ? null : value));

export const clientContactInputSchema = z.strictObject({
  id: z.string().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(CLIENT_CONTACT_NAME_MAX),
  email: z
    .email()
    .max(254)
    .transform((email) => email.toLowerCase()),
});
export type ClientContactInput = z.infer<typeof clientContactInputSchema>;

export const clientInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(CLIENT_NAME_MAX),
  website: optionalUrl(httpUrlSchema),
  logoUrl: optionalUrl(httpsUrlSchema),
  contacts: z
    .array(clientContactInputSchema)
    .max(CLIENT_CONTACTS_MAX)
    .default([])
    .refine((contacts) => new Set(contacts.map((contact) => contact.email)).size === contacts.length, { message: 'duplicate_contact' }),
});
export type ClientInput = z.input<typeof clientInputSchema>;
export type ParsedClientInput = z.output<typeof clientInputSchema>;

/** `clientId: null` takes the job away from its client. */
export const jobClientInputSchema = z.strictObject({
  clientId: z.string().min(1).nullable(),
  display: z.enum(CLIENT_DISPLAYS).default('named'),
});

/** Whether the organization recruits for clients, and the reference of its authorization to do so (shown on client ads). */
export interface AgencySetting {
  readonly recruitsForClients: boolean;
  readonly agencyAuthorization: string | null;
}

export const agencySettingInputSchema = z.strictObject({
  recruitsForClients: z.boolean(),
  agencyAuthorization: z
    .string()
    .trim()
    .max(AGENCY_AUTHORIZATION_MAX)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
});

/**
 * What a candidate reads about the client of an ad. The agency is always the organization publishing the page, so the
 * ad is never anonymous; a confidential client is said to be confidential, never replaced by another name.
 */
export interface PublicJobClientDto {
  readonly display: ClientDisplay;
  /** Null when confidential. */
  readonly name: string | null;
  readonly website: string | null;
  readonly logo: string | null;
  /** The agency's authorization reference (D.Lgs. 276/2003, art. 9), when it set one. */
  readonly agencyAuthorization: string | null;
}

export function publicJobClientOf(client: Pick<Client, 'name' | 'website' | 'logoUrl'>, display: ClientDisplay, agencyAuthorization: string | null): PublicJobClientDto {
  if (display === 'confidential') return { display, name: null, website: null, logo: null, agencyAuthorization };
  return { display, name: client.name, website: client.website, logo: client.logoUrl, agencyAuthorization };
}

// --- HTTP shapes (dates as ISO strings). ---

export interface ClientDto {
  readonly id: string;
  readonly name: string;
  readonly website: string | null;
  readonly logoUrl: string | null;
  readonly contacts: readonly ClientContact[];
  readonly archived: boolean;
  /** Jobs of this client, every status. */
  readonly jobCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface JobClientDto {
  readonly jobId: string;
  /** Null when the job has no client. */
  readonly client: { readonly id: string; readonly name: string; readonly archived: boolean } | null;
  readonly display: ClientDisplay;
}
