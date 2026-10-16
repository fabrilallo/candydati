/**
 * Plain text out of HTML (an email without a plain part, an imported cover letter), by one left-to-right scan.
 *
 * Tags are never removed with regular expressions: a regex pass can leave markup behind (`<scr<script>ipt>`) and
 * misreads `>` inside quoted attributes or comments. The result is text, never HTML: whoever shows it escapes it
 * (Vue interpolation in the app, `textToHtml` in emails), so a `<` decoded from `&lt;` is just a character.
 */

export interface HtmlToTextOptions {
  /** What a closing block element (p, div, li, tr, h1-h6, blockquote) becomes. Default: a blank line. */
  readonly blockBreak?: string;
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
const MAX_CODE_POINT = 0x10ffff;
const BLOCK_CLOSERS = new Set(['p', 'div', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote']);
/** Elements whose content is not text for a reader: skipped up to their closing tag (or the end, when unclosed). */
const SKIPPED = new Set(['script', 'style', 'head']);
const NAME_START = /[a-z!?]/i;
const NAME_CHAR = /[a-z0-9]/i;

/** `&amp;`, `&#33;`, `&#x41;` and the few named entities email bodies use; anything else stays as written. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (!entity.startsWith('#')) return ENTITIES[entity.toLowerCase()] ?? whole;
    const hex = entity[1] === 'x' || entity[1] === 'X';
    const code = hex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    if (code === 0) return '';
    return code <= MAX_CODE_POINT ? String.fromCodePoint(code) : whole;
  });
}

interface Tag {
  /** Index just past the tag. */
  readonly end: number;
  /** Lowercase; empty for comments, doctypes and processing instructions. */
  readonly name: string;
  readonly closing: boolean;
}

/** Index just past the `>` that ends a tag, skipping quoted attribute values; the end of the input when it never ends. */
function tagEnd(html: string, from: number): number {
  let quote = '';
  let previous = '';
  for (let index = from; index < html.length; index += 1) {
    const char = html.charAt(index);
    if (quote !== '') {
      if (char === quote) quote = '';
    } else if (char === '>') {
      return index + 1;
    } else if ((char === '"' || char === "'") && previous === '=') {
      quote = char;
    }
    if (char.trim() !== '') previous = char;
  }
  return html.length;
}

/** The markup that starts at `start` (a `<`), or null when that `<` is plain text (`a < b`). */
function readTag(html: string, start: number): Tag | null {
  if (html.startsWith('<!--', start)) {
    const close = html.indexOf('-->', start + 4);
    return { end: close < 0 ? html.length : close + 3, name: '', closing: false };
  }
  const closing = html.charAt(start + 1) === '/';
  const nameStart = start + (closing ? 2 : 1);
  if (!NAME_START.test(html.charAt(nameStart))) return null;
  let nameEnd = nameStart + 1;
  while (nameEnd < html.length && NAME_CHAR.test(html.charAt(nameEnd))) nameEnd += 1;
  const name = NAME_CHAR.test(html.charAt(nameStart)) ? html.slice(nameStart, nameEnd).toLowerCase() : '';
  return { end: tagEnd(html, nameEnd), name, closing };
}

/** Index just past `</name ...>`, searched from `from`; the end of the input when the element is never closed. */
function skippedEnd(html: string, name: string, from: number): number {
  for (let at = html.indexOf('</', from); at >= 0; at = html.indexOf('</', at + 2)) {
    const after = at + 2 + name.length;
    if (html.slice(at + 2, after).toLowerCase() === name && !NAME_CHAR.test(html.charAt(after))) return tagEnd(html, after);
  }
  return html.length;
}

function tagText(tag: Tag, blockBreak: string): string {
  if (tag.name === 'br') return '\n';
  return tag.closing && BLOCK_CLOSERS.has(tag.name) ? blockBreak : '';
}

/** Single spaces inside lines, no blank line longer than one, nothing around the text. */
const tidy = (text: string): string =>
  text
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Text of an HTML document: tags dropped, script/style/head skipped, line breaks kept, entities decoded. */
export function htmlToText(html: string, options: HtmlToTextOptions = {}): string {
  const blockBreak = options.blockBreak ?? '\n\n';
  const parts: string[] = [];
  let index = 0;
  while (index < html.length) {
    const open = html.indexOf('<', index);
    const textEnd = open < 0 ? html.length : open;
    if (textEnd > index) parts.push(decodeEntities(html.slice(index, textEnd)));
    if (open < 0) break;
    const tag = readTag(html, open);
    if (tag === null) {
      parts.push('<');
      index = open + 1;
      continue;
    }
    parts.push(tagText(tag, blockBreak));
    index = !tag.closing && SKIPPED.has(tag.name) ? skippedEnd(html, tag.name, tag.end) : tag.end;
  }
  return tidy(parts.join(''));
}
