import type { CvMediaType } from '@candydati/domain';
import { safeFileName } from './file-name.js';
import { isWithinOoxmlBudget } from '../zip/bounded-inflate.js';
import { zipHasEntry } from './zip.js';

export interface SniffedCv {
  readonly mediaType: CvMediaType;
  readonly fileName: string;
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const startsWith = (bytes: Uint8Array, magic: readonly number[]): boolean => magic.every((value, index) => bytes[index] === value);

function detect(bytes: Uint8Array): CvMediaType | null {
  if (startsWith(bytes, PDF_MAGIC)) return PDF;
  // The declared sizes are the sender's word: what the document really inflates to is counted, under a cap.
  if (startsWith(bytes, ZIP_MAGIC) && zipHasEntry(bytes, 'word/document.xml') && isWithinOoxmlBudget(bytes)) return DOCX;
  return null;
}

/** Decides the type from the content only; the declared name and type are never trusted. */
export function sniffCv(bytes: Uint8Array, declaredName: string): SniffedCv | null {
  const mediaType = detect(bytes);
  return mediaType ? { mediaType, fileName: safeFileName(declaredName, mediaType) } : null;
}
