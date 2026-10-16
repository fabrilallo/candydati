import { z } from 'zod';
import { httpUrlSchema } from '../url/http-url.js';

/**
 * What the app knows about a built-in source connector (ADR 0009, Phase 6): enough to list it, draw its credentials form
 * and say how mature it is. The connector itself (endpoints, mapping) lives in `@candydati/providers`.
 */
export const migrationConnectorIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,39}$/, 'connector_id');

/** A connector is `beta` until a real migration confirms it (decision 6), then `stable`. */
export const MIGRATION_CONNECTOR_MATURITIES = ['beta', 'stable'] as const;
export type MigrationConnectorMaturity = (typeof MIGRATION_CONNECTOR_MATURITIES)[number];

/** `api`: the connector reads the vendor's API with the operator's key. `files`: it reads export files the operator uploads. */
export const MIGRATION_CONNECTOR_INPUTS = ['api', 'files'] as const;
export type MigrationConnectorInput = (typeof MIGRATION_CONNECTOR_INPUTS)[number];

export const MIGRATION_CONNECTOR_FIELD_TYPES = ['text', 'password'] as const;

/** Most credential fields a connector may ask for, and the longest value of one. */
export const MIGRATION_CONNECTOR_CREDENTIALS_MAX = 8;
export const MIGRATION_CONNECTOR_CREDENTIAL_MAX_CHARS = 4096;

const localized = z.strictObject({ en: z.string().min(1).max(300), it: z.string().min(1).max(300) });
const httpsUrl = httpUrlSchema.refine((url) => url.startsWith('https://'), 'https_only');

/** One input of the credentials form. A secret is always typed as a password and never shown back. */
export const migrationConnectorFieldSchema = z
  .strictObject({
    name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/),
    label: localized,
    help: localized.optional(),
    type: z.enum(MIGRATION_CONNECTOR_FIELD_TYPES),
    secret: z.boolean(),
    /** Where the vendor explains how to get this value. */
    howToUrl: httpsUrl.optional(),
    placeholder: z.string().max(120).optional(),
  })
  .refine((field) => !field.secret || field.type === 'password', { message: 'secret_must_be_password', path: ['type'] });
export type MigrationConnectorField = z.infer<typeof migrationConnectorFieldSchema>;

/** A connector as `GET /api/v1/migrations/connectors` lists it: never its credential schema, never a value. */
export const migrationConnectorDtoSchema = z.object({
  id: migrationConnectorIdSchema,
  label: z.string().min(1).max(80).describe('The vendor product name, as the vendor writes it.'),
  maturity: z.enum(MIGRATION_CONNECTOR_MATURITIES),
  input: z.enum(MIGRATION_CONNECTOR_INPUTS),
  docsUrl: httpsUrl.describe('The public documentation the connector is built on.'),
  fields: z.array(migrationConnectorFieldSchema).max(MIGRATION_CONNECTOR_CREDENTIALS_MAX),
});
export type MigrationConnectorDto = z.infer<typeof migrationConnectorDtoSchema>;

/** `POST /api/v1/migrations/connector`: the connector, and the credentials its own schema then checks. */
export const migrationConnectorInputSchema = z.strictObject({
  connectorId: migrationConnectorIdSchema,
  credentials: z
    .record(z.string().max(40), z.string().max(MIGRATION_CONNECTOR_CREDENTIAL_MAX_CHARS))
    .refine((value) => Object.keys(value).length <= MIGRATION_CONNECTOR_CREDENTIALS_MAX, 'too_many_credentials')
    .meta({ writeOnly: true })
    .describe('Write-only: kept encrypted only while the fetch runs, then wiped; never returned, logged or audited.'),
});
export type MigrationConnectorInputDto = z.infer<typeof migrationConnectorInputSchema>;

/**
 * What a connector says about its own reading, for the preview: counts and column headers, never a cell. For example a
 * file-based connector lists the columns it did not recognise and the score columns it ignored on purpose.
 */
export const MIGRATION_FETCH_NOTICE_CODES = ['columns_unrecognized', 'columns_ignored', 'rows_skipped', 'rows_duplicate', 'values_dropped', 'cvs_unmatched'] as const;
export const migrationFetchNoticeSchema = z.object({
  code: z.enum(MIGRATION_FETCH_NOTICE_CODES),
  /** Columns, rows or files concerned. */
  count: z.number().int().nonnegative(),
  /** Column headers (not values), when the notice is about columns. */
  headers: z.array(z.string().max(100)).max(30).optional(),
});
export type MigrationFetchNotice = z.infer<typeof migrationFetchNoticeSchema>;

/** How far a connector fetch is (also on every part it produced). `total` is null while the source has not said. */
export interface MigrationFetchCounts {
  readonly done: number;
  readonly total: number | null;
  /** Packages the fetch produced: more than one when the source is larger than one package can hold. */
  readonly parts?: number | undefined;
  /**
   * Internal: temporary file slots reserved in storage during the fetch (`.../fetch/{n}`), so a fetch that died can still
   * have its files deleted by the purge. Never sent to the web.
   */
  readonly reservedFiles?: number | undefined;
  /** Internal: a `files` connector's upload (the spreadsheet is always there; the ZIP of CVs is optional). */
  readonly upload?: { readonly cvs: boolean } | undefined;
  /** What the connector reported about its reading (shown in the preview). */
  readonly notices?: readonly MigrationFetchNotice[] | undefined;
}

/** Where the files a fetch downloads wait until they are written into the package of their part. */
export const migrationFetchFileKey = (filePrefix: string, slot: number): string => `${filePrefix}fetch/${slot}`;

/**
 * Why a fetch failed, as stored in the batch `error` and shown in the wizard. Never a vendor's message: those can echo
 * a URL or a key.
 */
export const MIGRATION_FETCH_ERRORS = [
  /** The source refused the credentials (401/403). */
  'credentials_refused',
  /** The source could not be reached, timed out, or kept answering with server errors. */
  'source_unavailable',
  /** The source kept limiting the request rate past the retries. */
  'source_rate_limited',
  /** The source answered something the connector does not understand (not JSON, unexpected shape, too large). */
  'source_invalid_response',
  /** One job alone is larger than a package can hold: it cannot be split further. */
  'part_too_large',
  /** The connector is not available on this instance any more. */
  'connector_unavailable',
  /** The worker stopped while fetching: the credentials are gone, start again. */
  'fetch_interrupted',
  /** A file-based connector could not read the uploaded file (not a spreadsheet, empty, unreadable). */
  'input_unreadable',
  /** A file-based connector did not find the columns it needs: the message lists the headers it expected. */
  'input_columns_missing',
  /** Anything else. */
  'fetch_failed',
] as const;
export type MigrationFetchError = (typeof MIGRATION_FETCH_ERRORS)[number];
