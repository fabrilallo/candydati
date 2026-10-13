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
