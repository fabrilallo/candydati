import type { AttachmentMediaType } from '@candydati/domain';

export const FILE_NAME_MAX = 120;
/** Every CV type is an attachment type too. */
const EXTENSIONS: Readonly<Record<AttachmentMediaType, string>> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/rtf': 'rtf',
  'text/plain': 'txt',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};
const FALLBACK_BASE = 'cv';
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f-\u009f"'`<>:*?|;&$%{}[\]^~#\\/\u202a-\u202e\u2066-\u2069]/g;

/**
 * A display and download name: no path, control or bidi characters, no quotes, extension forced to match the
 * sniffed type, at most 120 characters.
 */
export function safeFileName(name: string, mediaType: AttachmentMediaType, fallback: string = FALLBACK_BASE): string {
  const extension = EXTENSIONS[mediaType];
  const lastSegment = name.split(/[\\/]/).pop() ?? '';
  const withoutExtension = lastSegment.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  const base = withoutExtension
    .normalize('NFC')
    .replace(UNSAFE, '')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s-]+|[.\s]+$/g, '')
    .trim();
  const limited = Array.from(base || fallback)
    .slice(0, FILE_NAME_MAX - extension.length - 1)
    .join('')
    .trim();
  return `${limited || fallback}.${extension}`;
}
