import { z } from 'zod';
import { cvExtractionSchema } from '../candidate/application.js';
import { importMappingSchema, type ImportMapping } from './mapping.js';

/** Days an imported candidate has to reconfirm consent before their data is erased (PRODUCT.md §6). */
export const IMPORT_RECONFIRM_DAYS = 30;

export const IMPORT_LIMITS = {
  maxBytes: 200 * 1024 * 1024,
  maxFiles: 1000,
  maxRows: 5000,
} as const;

/** Applications written per database transaction when committing. */
export const IMPORT_COMMIT_CHUNK = 50;
export const IMPORT_ITEMS_PAGE_MAX = 200;
export const IMPORT_NOTE_MAX = 5000;

export const IMPORT_STATUSES = ['uploaded', 'analyzing', 'ready', 'importing', 'done', 'failed', 'undone'] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

/** Candidates imported without an email get this address: they cannot be written to, and it is never shown as a contact. */
export const IMPORT_PLACEHOLDER_DOMAIN = 'no-email.import.invalid';
export const placeholderEmail = (candidateId: string): string => `${candidateId}@${IMPORT_PLACEHOLDER_DOMAIN}`;
export const isPlaceholderEmail = (email: string): boolean => email.toLowerCase().endsWith(`@${IMPORT_PLACEHOLDER_DOMAIN}`);

/** Where the uploaded originals live. Everything of a batch is under one prefix. */
export const importFilePrefix = (organizationId: string, batchId: string): string => `organizations/${organizationId}/imports/${batchId}/`;
export const importFileKey = (organizationId: string, batchId: string, relativePath: string): string =>
  `${importFilePrefix(organizationId, batchId)}${relativePath.replace(/^\/+/, '')}`;

export interface ImportSourceFile {
  readonly key: string;
  readonly fileName: string;
  readonly sizeBytes: number;
}

export interface ImportCounts {
  readonly files: number;
  readonly cvs: number;
  readonly rows: number;
  readonly items: number;
  readonly included: number;
  /** Applications created by the commit. */
  readonly imported: number;
  /** Of those, how many attached to an already existing candidate. */
  readonly merged: number;
  /** Items that could not be written (the rest of the batch still went in). */
  readonly failed: number;
  /** Items without email: no reconfirmation email can be sent. */
  readonly noEmail: number;
  /** Reconfirmation emails queued. */
  readonly emailsQueued: number;
  /** Set by the undo: candidates that had reconfirmed and were left in place. */
  readonly skippedReconfirmed: number;
  /** Set by the undo: applications erased. */
  readonly erased: number;
}

export const emptyImportCounts = (): ImportCounts => ({
  files: 0,
  cvs: 0,
  rows: 0,
  items: 0,
  included: 0,
  imported: 0,
  merged: 0,
  failed: 0,
  noEmail: 0,
  emailsQueued: 0,
  skippedReconfirmed: 0,
  erased: 0,
});

export interface ImportBatch {
  readonly id: string;
  readonly organizationId: string;
  readonly jobId: string;
  readonly stageId: string;
  readonly status: ImportStatus;
  readonly createdBy: string;
  readonly counts: ImportCounts;
  readonly mapping: ImportMapping | null;
  /** Column headers of the sheet(s), for the mapping editor. */
  readonly headers: readonly string[];
  /** Uploaded originals (analysis input). Cleared once the batch is done or undone. */
  readonly sourceFiles: readonly ImportSourceFile[];
  /** Why the batch is `failed`. */
  readonly error: string | null;
  readonly createdAt: Date;
  readonly importedAt: Date | null;
  readonly undoneAt: Date | null;
}

export const IMPORT_CONFIDENCES = ['high', 'medium', 'low'] as const;
export type ImportConfidence = (typeof IMPORT_CONFIDENCES)[number];

export const IMPORT_FLAGS = ['no_email', 'no_cv', 'incomplete_name', 'existing_candidate', 'duplicate_merged', 'email_conflict'] as const;
export type ImportFlag = (typeof IMPORT_FLAGS)[number];

/** A CV already parsed by the worker: text, structured data and the identifiers found in the text. */
export const parsedImportCvSchema = z.object({
  fileName: z.string().min(1).max(300),
  /** Storage key of the CV file (under the batch prefix). */
  key: z.string().min(1).max(600),
  text: z.string().max(400_000),
  extraction: cvExtractionSchema.nullable().default(null),
  email: z.string().max(254).optional(),
  phone: z.string().max(40).optional(),
  name: z.string().max(200).optional(),
});
export type ParsedImportCv = z.output<typeof parsedImportCvSchema>;
export type ParsedImportCvInput = z.input<typeof parsedImportCvSchema>;

/** One row of a sheet. `cells` is keyed by the column header. */
export const parsedImportRowSchema = z.object({
  index: z.number().int().min(0),
  cells: z.record(z.string(), z.string().max(10_000)),
});
export type ParsedImportRow = z.infer<typeof parsedImportRowSchema>;

export type ImportConflictKind = 'sources' | 'existing';

/** Two values for the same field. `kept` is what the import uses (or leaves in place for an existing candidate). */
export interface ImportConflict {
  readonly field: 'email' | 'phone' | 'name' | 'linkedinUrl';
  readonly kind: ImportConflictKind;
  readonly kept: string;
  readonly other: string;
}

export interface ImportProposedCandidate {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly linkedinUrl: string | null;
  readonly tags: readonly string[];
  /** Row notes, attached as a candidate note. */
  readonly note: string | null;
}

export interface ImportExistingRef {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string | null;
  readonly linkedinUrl: string | null;
}

/** What the matching proposes for one person. The CV text stays in the analysis, not here. */
export interface ImportItemProposal {
  readonly confidence: ImportConfidence;
  /** How CV and row were paired. */
  readonly basis: 'email' | 'file_name' | 'name' | 'fuzzy_name' | 'single';
  readonly candidate: ImportProposedCandidate;
  readonly cv: { readonly fileName: string; readonly key: string } | null;
  /** Headline of the CV, for the preview. */
  readonly headline: string | null;
  readonly sources: { readonly rows: readonly number[]; readonly files: readonly string[] };
  readonly existing: ImportExistingRef | null;
  readonly conflicts: readonly ImportConflict[];
  readonly flags: readonly ImportFlag[];
}

export const IMPORT_ITEM_STATUSES = ['pending', 'imported', 'failed'] as const;
export type ImportItemStatus = (typeof IMPORT_ITEM_STATUSES)[number];

export interface ImportItem {
  readonly id: string;
  readonly organizationId: string;
  readonly batchId: string;
  readonly position: number;
  readonly included: boolean;
  readonly status: ImportItemStatus;
  readonly error: string | null;
  readonly proposal: ImportItemProposal;
}

/** The raw parsed inputs of a batch: what re-matching starts from. Deleted with the batch's data. */
export interface ImportAnalysis {
  readonly batchId: string;
  readonly organizationId: string;
  readonly cvs: readonly ParsedImportCv[];
  readonly rows: readonly ParsedImportRow[];
}

export const importItemSelectionSchema = z.object({ itemId: z.string().min(1), included: z.boolean() });

export const importMappingInputSchema = importMappingSchema;
