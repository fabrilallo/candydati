import { DAY_MS, cvExtractionSchema, type CvExtractionRecord, type CvMediaType } from '@candydati/domain';
import { z } from 'zod';
import type { CvExtractionDeps } from '../../intake-ports.js';
import { defineUseCase } from '../../use-case.js';

/** Postgres rejects NUL in text, and a CV is never a book: bound what goes into the search index. */
export const CV_TEXT_MAX_CHARS = 200_000;

export type RunCvExtractionResult = CvExtractionRecord['status'] | 'skipped';

const cleanText = (raw: string): string => raw.replaceAll('\u0000', '').trim().slice(0, CV_TEXT_MAX_CHARS);

const inputSchema = z.object({ organizationId: z.string().min(1), applicationId: z.string().min(1) });

type Outcome = Pick<CvExtractionRecord, 'status' | 'text' | 'data' | 'source'>;
const FAILED: Outcome = { status: 'failed', text: null, data: null, source: null };

/** A file that is gone is a final answer for this application; any other storage error is an outage and must retry. */
async function readBytes(deps: CvExtractionDeps, key: string): Promise<Uint8Array | null> {
  try {
    return await deps.files.get(key);
  } catch (error) {
    if (error instanceof Error && (error.name === 'FileNotFoundError' || error.name === 'InvalidStorageKeyError')) return null;
    throw error;
  }
}

/** Only the extractor's errors mean "no text": storage errors propagate so the job retries. */
async function readText(deps: CvExtractionDeps, key: string, mediaType: CvMediaType): Promise<string | null> {
  const bytes = await readBytes(deps, key);
  if (bytes === null) return null;
  try {
    const text = cleanText(await deps.textExtractor.extractText(bytes, mediaType));
    return text === '' ? null : text;
  } catch {
    return null;
  }
}


/** Cost guard: past the daily budget of the organization the model is skipped and only the text is kept. */
async function overBudget(deps: CvExtractionDeps, organizationId: string): Promise<boolean> {
  if (deps.modelDailyBudget === undefined) return false;
  const since = new Date(deps.now().getTime() - DAY_MS);
  return (await deps.extractions.countFinishedSince(organizationId, since)) >= deps.modelDailyBudget;
}

/** The model's answer is untrusted: it only counts if it matches the schema. Any failure leaves the plain text. */
async function readStructured(deps: CvExtractionDeps, organizationId: string, text: string): Promise<Outcome> {
  const textOnly: Outcome = { status: 'text_only', text, data: null, source: 'text' };
  if (!deps.modelExtractor || (await overBudget(deps, organizationId))) return textOnly;
  try {
    const parsed = cvExtractionSchema.safeParse(await deps.modelExtractor.extract(text));
    return parsed.success ? { status: 'done', text, data: parsed.data, source: 'model' } : textOnly;
  } catch {
    return textOnly;
  }
}

/**
 * Worker use case (system actor). Idempotent: an already extracted application is left as it is. It never throws for
 * a bad document: unreadable files and empty text end as `failed`, an unusable model answer as `text_only`.
 */
export const runCvExtraction = defineUseCase<CvExtractionDeps, typeof inputSchema, RunCvExtractionResult>({
  name: 'runCvExtraction',
  input: inputSchema,
  organizationOf: (input) => input.organizationId,
  permission: { skip: 'system job enqueued by submitApplication; the organization scope still applies' },
  audit: { skip: 'derived data on an application already audited as received; no personal data in the event' },
  handler: async ({ deps, input }): Promise<RunCvExtractionResult> => {
    const application = await deps.applications.findById(input.organizationId, input.applicationId);
    if (!application) return 'skipped';
    const current = await deps.extractions.findByApplication(input.organizationId, application.id);
    if (current && (current.status === 'done' || current.status === 'text_only')) return current.status;
    const text = await readText(deps, application.cv.key, application.cv.mediaType);
    const outcome = text === null ? FAILED : await readStructured(deps, input.organizationId, text);
    await deps.extractions.upsert({
      applicationId: application.id,
      organizationId: input.organizationId,
      ...outcome,
      updatedAt: deps.now(),
    });
    return outcome.status;
  },
});
