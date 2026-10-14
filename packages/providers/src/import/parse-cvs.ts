import type { ParsedImportCvInput } from '@tt/domain';
import { extractCvText } from '../cv/extract-text.js';
import type { CvExtractor } from '../cv/extractor.js';
import { extractContacts } from './contacts.js';
import type { FoundCv } from './gather.js';

export const DEFAULT_ANALYSIS_CONCURRENCY = 4;
/** After this long the remaining CVs keep their plain text only: the preview must not wait for the model forever. */
export const DEFAULT_ANALYSIS_BUDGET_MS = 5 * 60 * 1000;

export interface ParseCvOptions {
  /** Without it (no model configured) only text and regexes are used. */
  readonly extractor?: CvExtractor | null | undefined;
  readonly concurrency?: number | undefined;
  readonly budgetMs?: number | undefined;
  readonly now?: (() => number) | undefined;
}

async function parseOne(cv: FoundCv, key: string, extractor: CvExtractor | null, withinBudget: () => boolean): Promise<ParsedImportCvInput> {
  const text = await extractCvText(cv.bytes, cv.mediaType).catch(() => '');
  const contacts = extractContacts(text);
  const extraction = extractor && text.trim() !== '' && withinBudget() ? (await extractor.extract(text)).data : null;
  const phone = contacts.phones[0];
  return {
    fileName: cv.fileName,
    key,
    text,
    extraction,
    ...(contacts.email ? { email: contacts.email } : {}),
    ...(phone ? { phone } : {}),
    ...(contacts.fullName ? { name: contacts.fullName.value } : {}),
  };
}

/** Reads every CV with at most `concurrency` at a time, in order. Contacts come from the text; the model only adds structure. */
export async function parseCvs(cvs: readonly FoundCv[], keys: readonly string[], options: ParseCvOptions = {}): Promise<readonly ParsedImportCvInput[]> {
  const now = options.now ?? Date.now;
  const deadline = now() + (options.budgetMs ?? DEFAULT_ANALYSIS_BUDGET_MS);
  const withinBudget = (): boolean => now() < deadline;
  const results: ParsedImportCvInput[] = new Array<ParsedImportCvInput>(cvs.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let index = next++; index < cvs.length; index = next++) {
      const cv = cvs[index];
      const key = keys[index];
      if (cv && key) results[index] = await parseOne(cv, key, options.extractor ?? null, withinBudget);
    }
  };
  const size = Math.max(1, Math.min(options.concurrency ?? DEFAULT_ANALYSIS_CONCURRENCY, cvs.length));
  await Promise.all(Array.from({ length: size }, worker));
  return results;
}

export interface CvParser {
  /** Stores and reads one CV. Waits while `concurrency` CVs are in flight, so the caller never holds more than that many. */
  submit(cv: FoundCv): Promise<void>;
  /** Waits for the rest; the results are in submission order. Throws the first failure. */
  finish(): Promise<readonly ParsedImportCvInput[]>;
}

/**
 * Like `parseCvs` for CVs that arrive one by one: `prepare` runs first (it stores the CV and returns its key), then the
 * CV is read and its bytes can be released. Memory is bounded by `concurrency`, not by the number of CVs.
 */
export function createCvParser(prepare: (cv: FoundCv, index: number) => Promise<string>, options: ParseCvOptions = {}): CvParser {
  const now = options.now ?? Date.now;
  const deadline = now() + (options.budgetMs ?? DEFAULT_ANALYSIS_BUDGET_MS);
  const withinBudget = (): boolean => now() < deadline;
  const limit = Math.max(1, options.concurrency ?? DEFAULT_ANALYSIS_CONCURRENCY);
  const results: ParsedImportCvInput[] = [];
  const inflight = new Set<Promise<void>>();
  let failure: { readonly error: unknown } | null = null;
  let next = 0;
  const raise = (): void => {
    if (failure) throw failure.error;
  };
  return {
    async submit(cv) {
      raise();
      while (inflight.size >= limit) await Promise.race(inflight);
      raise();
      const index = next++;
      const task: Promise<void> = (async () => {
        const key = await prepare(cv, index);
        results[index] = await parseOne(cv, key, options.extractor ?? null, withinBudget);
      })()
        .catch((error: unknown) => {
          failure ??= { error };
        })
        .finally(() => inflight.delete(task));
      inflight.add(task);
    },
    async finish() {
      await Promise.all(inflight);
      raise();
      return results;
    },
  };
}
