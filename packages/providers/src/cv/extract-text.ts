import type { CvMediaType } from '@tt/domain';
import { isWithinOoxmlBudget } from '../zip/bounded-inflate.js';

export const CV_TEXT_MAX_CHARS = 60_000;

const PDF = 'application/pdf';

export function normalizeCvText(raw: string): string {
  return (
    raw
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
      .replace(/\r\n?/g, '\n')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, CV_TEXT_MAX_CHARS)
  );
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const document = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(document, { mergePages: true });
  return text;
}

async function docxText(bytes: Uint8Array): Promise<string> {
  // mammoth inflates whatever the archive holds: count the real size first, with a cap (zip bombs lie in their headers).
  if (!isWithinOoxmlBudget(bytes)) throw new Error('The DOCX inflates to more than allowed.');
  const mammoth = (await import('mammoth')).default;
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return value;
}

/** Plain text of a CV, whitespace normalised and capped. Throws when the document cannot be parsed. */
export async function extractCvText(bytes: Uint8Array, mediaType: CvMediaType): Promise<string> {
  const raw = mediaType === PDF ? await pdfText(bytes) : await docxText(bytes);
  return normalizeCvText(raw);
}
