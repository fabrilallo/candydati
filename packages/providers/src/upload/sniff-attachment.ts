import type { AttachmentMediaType } from '@candydati/domain';
import { safeFileName } from './file-name.js';
import { zipHasEntry } from './zip.js';

export interface SniffedAttachment {
  readonly mediaType: AttachmentMediaType;
  readonly fileName: string;
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
/** OLE compound file: legacy Word, but also Excel, PowerPoint and MSI installers. */
const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const RTF_MAGIC = [...'{\\rtf'].map((char) => char.charCodeAt(0));
const ODT_MIMETYPE = 'application/vnd.oasis.opendocument.text';
/** The stream every legacy Word document has, as its name is stored in the compound file directory (UTF-16LE). */
const WORD_STREAM = Uint8Array.from([...'WordDocument'].flatMap((char) => [char.charCodeAt(0), 0]));

const startsWith = (bytes: Uint8Array, magic: readonly number[], at = 0): boolean => magic.every((value, index) => bytes[at + index] === value);

function contains(bytes: Uint8Array, needle: Uint8Array): boolean {
  const first = needle[0];
  for (let at = bytes.indexOf(first ?? 0); at >= 0 && at + needle.length <= bytes.length; at = bytes.indexOf(first ?? 0, at + 1)) {
    if (startsWith(bytes, [...needle], at)) return true;
  }
  return false;
}

/** ODF: the first entry is `mimetype`, stored uncompressed, holding exactly the text document type. */
function isOdt(bytes: Uint8Array): boolean {
  if (bytes.length < 30) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const size = view.getUint32(18, true);
  const name = new TextDecoder().decode(bytes.subarray(30, 30 + nameLength));
  const start = 30 + nameLength + extraLength;
  if (name !== 'mimetype' || view.getUint16(8, true) !== 0 || start + size > bytes.length) return false;
  return new TextDecoder().decode(bytes.subarray(start, start + size)) === ODT_MIMETYPE && zipHasEntry(bytes, 'content.xml');
}

function detectZip(bytes: Uint8Array): AttachmentMediaType | null {
  if (zipHasEntry(bytes, 'word/document.xml')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return isOdt(bytes) ? 'application/vnd.oasis.opendocument.text' : null;
}

/** Control characters other than tab, line feed, form feed and carriage return: binary data, not text. */
// eslint-disable-next-line no-control-regex
const BINARY = /[\u0000-\u0008\u000b\u000e-\u001f\u007f]/;
/** Markup a browser or a viewer could render or run: refused even as plain text. */
const MARKUP = /<\s*(?:!doctype|html|head|body|script|svg|iframe|object|embed|\?xml)\b|^\s*</i;

/** Plain text: valid UTF-8 (a BOM allowed), no binary bytes, no markup, not a script (`#!`). */
function isPlainText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return false;
  }
  return !BINARY.test(text) && !MARKUP.test(text) && !text.startsWith('#!');
}

function detect(bytes: Uint8Array): AttachmentMediaType | null {
  if (startsWith(bytes, PDF_MAGIC)) return 'application/pdf';
  if (startsWith(bytes, PNG_MAGIC)) return 'image/png';
  if (startsWith(bytes, JPEG_MAGIC)) return 'image/jpeg';
  if (startsWith(bytes, RTF_MAGIC)) return 'application/rtf';
  if (startsWith(bytes, ZIP_MAGIC)) return detectZip(bytes);
  if (startsWith(bytes, CFB_MAGIC)) return contains(bytes, WORD_STREAM) ? 'application/msword' : null;
  return isPlainText(bytes) ? 'text/plain' : null;
}

/**
 * An attachment's type from its content only (the declared name and type are never trusted): PDF, DOCX, DOC, ODT, RTF,
 * plain text, PNG or JPEG. Null for anything else: executables, archives (a ZIP that is not a document), HTML, SVG,
 * spreadsheets, installers. The file name is made safe and given the extension of the sniffed type.
 */
export function sniffAttachment(bytes: Uint8Array, declaredName: string): SniffedAttachment | null {
  const mediaType = detect(bytes);
  return mediaType ? { mediaType, fileName: safeFileName(declaredName, mediaType, 'attachment') } : null;
}
