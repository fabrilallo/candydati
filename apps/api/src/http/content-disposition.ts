/** Characters allowed unescaped in an RFC 5987 `filename*` value (RFC 8187 attr-char). */
const encodeRfc5987 = (value: string): string =>
  encodeURIComponent(value).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

/** ASCII fallback for old clients: anything outside printable ASCII, quotes and backslashes becomes `_`. */
const asciiFallback = (value: string): string => value.replace(/[^\x20-\x7e]|["\\%]/g, '_');

/** RFC 6266: a quoted ASCII `filename` plus the exact UTF-8 name in `filename*`. */
export function contentDisposition(type: 'inline' | 'attachment', fileName: string): string {
  return `${type}; filename="${asciiFallback(fileName)}"; filename*=UTF-8''${encodeRfc5987(fileName)}`;
}

/** Inline only when asked AND the file is a PDF; everything else downloads. */
export const wantsInline = (disposition: unknown, mediaType: string): boolean =>
  disposition === 'inline' && mediaType === 'application/pdf';
