import { cvExtractionSchema, type CvExtractionRecord, type CvMediaType } from '@tt/domain';
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

async function readText(deps: CvExtractionDeps, key: string, mediaType: CvMediaType): Promise<string | null> {
  try {
    const text = cleanText(await deps.textExtractor.extractText(await deps.files.get(key), mediaType));
    return text === '' ? null : text;
  } catch {
    return null;
  }
}

/** The model's answer is untrusted: it only counts if it matches the schema. Any failure leaves the plain text. */
async function readStructured(deps: CvExtractionDeps, text: string): Promise<Outcome> {
  const textOnly: Outcome = { status: 'text_only', text, data: null, source: 'text' };
  if (!deps.modelExtractor) return textOnly;
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
    const outcome = text === null ? FAILED : await readStructured(deps, text);
    await deps.extractions.upsert({
      applicationId: application.id,
      organizationId: input.organizationId,
      ...outcome,
      updatedAt: deps.now(),
    });
    return outcome.status;
  },
});
