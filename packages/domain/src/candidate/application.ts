import { z } from 'zod';
import { httpUrlSchema } from '../url/http-url.js';
import type { SelectionStage } from '../job/content.js';
import type { Locale } from '../platform/config.js';
import { NAME_MAX, personNameSchema } from './person-name.js';
import { CONSENT_SCOPES, type ConsentRecord, type ConsentStatus } from './privacy.js';
import type { ApplicationAnswer } from './attachment.js';

export const CV_MAX_BYTES = 10 * 1024 * 1024;
/** Checked against the file's magic bytes, never only the declared type or the extension. */
export const CV_MEDIA_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] as const;
export type CvMediaType = (typeof CV_MEDIA_TYPES)[number];

export { NAME_MAX };
export const MESSAGE_MAX = 3000;
export const NOTE_MAX = 5000;
export const TAG_MAX = 40;
export const TAGS_PER_CANDIDATE_MAX = 20;

/**
 * Public application form, without registration (PRODUCT.md §3.1). Only what selection needs (§7 minimisation): no photo,
 * no birth date, no gender, no marital status, no address. The CV arrives as a separate multipart part.
 */
export const applicationFormSchema = z.object({
  firstName: personNameSchema,
  lastName: personNameSchema,
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{6,20}$/, 'phone')
    .optional(),
  linkedinUrl: httpUrlSchema.max(300).optional(),
  message: z.string().trim().max(MESSAGE_MAX).default(''),
  /** `selection` must be present: without it the application cannot be processed. */
  consentScopes: z
    .array(z.enum(CONSENT_SCOPES))
    .min(1)
    .refine((scopes) => scopes.includes('selection'), 'selection_consent_required')
    .transform((scopes) => [...new Set(scopes)]),
  /** Version the candidate read; refused if it is no longer the active one. */
  privacyNoticeVersion: z.number().int().positive(),
  /** Honeypot: humans leave it empty. */
  website: z.string().max(0).optional(),
});
export type ApplicationForm = z.infer<typeof applicationFormSchema>;

/**
 * What the person typed on the public form, kept on the application. A public submission never rewrites the candidate
 * profile (anyone can type someone else's email): a recruiter compares the two and decides.
 */
export interface SubmittedContact {
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string | null;
  readonly linkedinUrl: string | null;
}

/**
 * Pipeline stages of a job: `received`, then one per stage of the DECLARED process (PRODUCT.md §4.1: what the candidate
 * reads is what the recruiter uses), in order. Outcomes are not stages: they close the application.
 */
export const RECEIVED_STAGE_ID = 'received';

export interface PipelineStage {
  /** `received` or the stable id of the declared stage (legacy stages without one fall back to `stage-<index>`). */
  readonly id: string;
  /** null for `received`; otherwise the declared stage. */
  readonly declared: SelectionStage | null;
}

export const pipelineStagesOf = (process: readonly SelectionStage[]): readonly PipelineStage[] => [
  { id: RECEIVED_STAGE_ID, declared: null },
  ...process.map((stage, index) => ({ id: stage.id ?? `stage-${index}`, declared: stage })),
];

export const OUTCOMES = ['hired', 'not_selected', 'withdrawn'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface Candidate {
  readonly id: string;
  readonly organizationId: string;
  readonly firstName: string;
  readonly lastName: string;
  /** Unique per organization: the same person applying twice is one candidate with two applications. */
  readonly email: string;
  readonly phone: string | null;
  readonly linkedinUrl: string | null;
  readonly tags: readonly string[];
  /** Latest consent across this candidate's applications decides talent-pool visibility. */
  readonly talentPool: boolean;
  /** Max of the retention expiries of the candidate's applications. */
  readonly retentionExpiresAt: Date;
  /** The import batch that created this candidate; null for everyone else. */
  readonly importBatchId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface StoredFile {
  readonly key: string;
  readonly fileName: string;
  readonly mediaType: CvMediaType;
  readonly sizeBytes: number;
}

export interface Application {
  readonly id: string;
  readonly organizationId: string;
  readonly jobId: string;
  readonly candidateId: string;
  readonly stageId: string;
  /** null while open. */
  readonly outcome: Outcome | null;
  readonly message: string;
  /** null only for an application brought by a migration from another ATS that had no CV (`migrationBatchId` set). */
  readonly cv: StoredFile | null;
  /** Form answers kept from the source ATS of a migration (absent or null: none). Capped by `cappedAnswers`. */
  readonly answers?: readonly ApplicationAnswer[] | null;
  /** Contact data as submitted on the public form; absent for imported and manual applications. */
  readonly submittedContact?: SubmittedContact | null;
  readonly consent: ConsentRecord;
  /** `to_renew` for imported data until the candidate reconfirms: then `consent` holds the real consent. */
  readonly consentStatus: ConsentStatus;
  /** The import batch that created this application; null for everyone else. */
  readonly importBatchId: string | null;
  /** The migration that brought this application from another ATS (absent or null: not migrated). */
  readonly migrationBatchId?: string | null;
  readonly retentionExpiresAt: Date;
  readonly source: 'careers_page' | 'manual' | 'import';
  /** Short sanitized label of where it came from (`sanitizeOrigin`): `linkedin`, `google.com`, `direct`, `import`, `manual`. */
  readonly origin: string;
  /** `utm_campaign` of the ad URL, sanitized (`sanitizeCampaign`). Absent or null: none. */
  readonly originCampaign?: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly stageChangedAt: Date;
  readonly closedAt: Date | null;
  /** The promise "we answer within N days": null once answered or decided, and for jobs with no declared response time. */
  readonly responseDueAt: Date | null;
  /** A person answered (message sent, move or decision) after the last stage change. Reset by a move. */
  readonly respondedAt: Date | null;
  /**
   * Imported data: when the reconfirmation email actually went out (absent: never, or not imported). Retention never
   * erases someone who could be asked and was not.
   */
  readonly reconfirmationSentAt?: Date | null;
}

export interface CandidateNote {
  readonly id: string;
  readonly organizationId: string;
  readonly candidateId: string;
  /** The application the note is about, if any. */
  readonly applicationId: string | null;
  /** The member who wrote it; null for a note brought by a migration whose author is not a member here. */
  readonly authorId: string | null;
  /** The external author of a migrated note (`authorId` null); null for notes written here. */
  readonly authorName: string | null;
  readonly body: string;
  readonly createdAt: Date;
}

/**
 * CV data extracted by a model or by text parsing. A suggestion shown next to the original document, which stays
 * the source of truth. Never contains photo, birth date, age, gender, marital status, nationality or health data.
 */
export const cvExtractionSchema = z.object({
  headline: z.string().max(200).optional(),
  location: z.string().max(120).optional(),
  yearsOfExperience: z.number().int().min(0).max(60).optional(),
  experiences: z
    .array(
      z.object({
        title: z.string().max(200),
        company: z.string().max(200).optional(),
        from: z.string().max(20).optional(),
        to: z.string().max(20).optional(),
        summary: z.string().max(600).optional(),
      }),
    )
    .max(30)
    .default([]),
  education: z
    .array(z.object({ title: z.string().max(200), institution: z.string().max(200).optional(), year: z.string().max(20).optional() }))
    .max(15)
    .default([]),
  skills: z.array(z.string().max(60)).max(60).default([]),
  languages: z.array(z.string().max(60)).max(15).default([]),
});
export type CvExtraction = z.infer<typeof cvExtractionSchema>;

export const EXTRACTION_STATUSES = ['pending', 'done', 'text_only', 'failed'] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export interface CvExtractionRecord {
  readonly applicationId: string;
  readonly organizationId: string;
  readonly status: ExtractionStatus;
  /** Plain text of the document, used for search. */
  readonly text: string | null;
  readonly data: CvExtraction | null;
  /** `text` when no model is configured: only the plain text was extracted. */
  readonly source: 'model' | 'text' | null;
  readonly updatedAt: Date;
}

const APPLICATIONS_BUSY: Readonly<Record<Locale, string>> = {
  it: 'Stiamo ricevendo moltissime candidature in questo momento. Riprova domani.',
  en: 'We are receiving a lot of applications right now. Please try again tomorrow.',
};

/** Shown to a candidate when a daily intake cap is reached, in the language of the ad they applied to. */
export const applicationsBusyMessage = (locale: Locale): string => APPLICATIONS_BUSY[locale];
