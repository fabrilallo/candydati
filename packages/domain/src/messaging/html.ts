const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

const URL_PATTERN = /https?:\/\/[^\s]+/g;
const TRAILING = /(?:[.,;:!?)\]]|&gt;|&quot;|&#39;)+$/;

/** Runs on already escaped text, so nothing a user typed can open a tag or leave an attribute. */
function linkify(escaped: string): string {
  return escaped.replace(URL_PATTERN, (match) => {
    const url = match.replace(TRAILING, '');
    const rest = match.slice(url.length);
    return `<a href="${url}" rel="noopener noreferrer">${url}</a>${rest}`;
  });
}

export interface TextToHtmlOptions {
  /**
   * Values that came from the outside (a candidate's name typed in the public form) and were substituted into the
   * text: they are shown as escaped plain text and never become links, even if they look like a URL.
   */
  readonly literals?: readonly string[] | undefined;
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Linkifies the text except where it is one of the `literals`. */
function linkifyOutside(paragraph: string, literals: readonly string[]): string {
  if (literals.length === 0) return linkify(escapeHtml(paragraph));
  const pattern = new RegExp(`(${[...literals].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')})`);
  return paragraph
    .split(pattern)
    .map((part, index) => (index % 2 === 1 ? escapeHtml(part) : linkify(escapeHtml(part))))
    .join('');
}

/**
 * Plain text to a minimal HTML body: everything is escaped, blank lines separate `<p>`, single line breaks become
 * `<br>`, and only http(s) URLs become links.
 */
export function textToHtml(text: string, options: TextToHtmlOptions = {}): string {
  const literals = (options.literals ?? []).filter((value) => /https?:\/\//i.test(value));
  const paragraphs = text
    .replaceAll('\r\n', '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');
  return paragraphs.map((paragraph) => `<p>${linkifyOutside(paragraph, literals).replaceAll('\n', '<br>')}</p>`).join('\n');
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Text of an HTML email, for when the sender gave no plain part. Stored as text, never rendered back as HTML. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_match, name: string) => ENTITIES[name] ?? '')
    .replace(/&#(\d{1,6});/g, (_match, code: string) => {
      const point = Number(code);
      return point > 0 ? String.fromCodePoint(point) : '';
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
