/**
 * A deliberately small XML reader: it exists to check, in tests and in the api, that what the builders produce is
 * well-formed and says what we think it says. It understands elements, attributes, text, CDATA, comments and the
 * declaration; no DTD, no entities beyond the five predefined and numeric ones. It throws on anything malformed.
 */
export interface XmlElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlElement[];
  /** Concatenated text and CDATA directly inside the element. */
  readonly text: string;
}

const NAMED: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const decode = (raw: string): string =>
  raw.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (_match, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    const named = NAMED[entity];
    if (named === undefined) throw new Error(`Unknown entity &${entity};`);
    return named;
  });

const NAME = '[A-Za-z_][\\w.:-]*';
const ATTRIBUTE = new RegExp(`\\s+(${NAME})\\s*=\\s*("([^"<]*)"|'([^'<]*)')`, 'y');

interface MutableElement {
  name: string;
  attributes: Record<string, string>;
  children: MutableElement[];
  text: string;
}

function readAttributes(source: string, start: number): { attributes: Record<string, string>; end: number } {
  const attributes: Record<string, string> = {};
  let position = start;
  for (;;) {
    ATTRIBUTE.lastIndex = position;
    const match = ATTRIBUTE.exec(source);
    if (!match) break;
    const name = match[1]!;
    if (name in attributes) throw new Error(`Duplicate attribute ${name}`);
    attributes[name] = decode(match[3] ?? match[4] ?? '');
    position = ATTRIBUTE.lastIndex;
  }
  return { attributes, end: position };
}

interface SpecialMarkup {
  readonly end: number;
  readonly text?: string;
  readonly error?: string;
}

/** Declarations, comments and CDATA sections: `end` is the offset after them, `text` the CDATA content. */
function readSpecialMarkup(source: string, position: number): SpecialMarkup | null {
  const kinds: ReadonlyArray<{ open: string; close: string; error: string; text: boolean }> = [
    { open: '<?', close: '?>', error: 'Unterminated declaration', text: false },
    { open: '<!--', close: '-->', error: 'Unterminated comment', text: false },
    { open: '<![CDATA[', close: ']]>', error: 'Unterminated CDATA', text: true },
  ];
  const kind = kinds.find((candidate) => source.startsWith(candidate.open, position));
  if (!kind) return null;
  const end = source.indexOf(kind.close, position);
  if (end === -1) return { end: position, error: kind.error };
  const after = end + kind.close.length;
  return kind.text ? { end: after, text: source.slice(position + kind.open.length, end) } : { end: after };
}

type StartTag =
  | { readonly ok: true; readonly element: MutableElement; readonly end: number; readonly selfClosing: boolean }
  | { readonly ok: false; readonly message: string };

/** Reads `<name attr="v" ...>` or `<name ... />` at `position`; `end` is the offset just past the closing `>`. */
function readStartTag(source: string, position: number): StartTag {
  const nameMatch = new RegExp(`^<(${NAME})`).exec(source.slice(position, position + 200));
  if (!nameMatch) return { ok: false, message: 'Malformed tag' };
  const name = nameMatch[1]!;
  const { attributes, end } = readAttributes(source, position + nameMatch[0].length);
  const rest = /^\s*(\/?)>/.exec(source.slice(end, end + 20));
  if (!rest) return { ok: false, message: `Malformed tag <${name}>` };
  return {
    ok: true,
    element: { name, attributes, children: [], text: '' },
    end: end + rest[0].length,
    selfClosing: rest[1] === '/',
  };
}

export function parseXml(source: string): XmlElement {
  let position = 0;
  let root: MutableElement | null = null;
  const stack: MutableElement[] = [];
  const fail = (message: string): never => {
    throw new Error(`${message} at ${position}`);
  };
  const currentText = (text: string): void => {
    const top = stack.at(-1);
    if (top) top.text += text;
    else if (text.trim() !== '') fail('Text outside the root element');
  };
  while (position < source.length) {
    const next = source.indexOf('<', position);
    if (next === -1) {
      currentText(decode(source.slice(position)));
      break;
    }
    if (next > position) currentText(decode(source.slice(position, next)));
    position = next;
    const special = readSpecialMarkup(source, position);
    if (special) {
      if (special.error) fail(special.error);
      if (special.text !== undefined && stack.length === 0) fail('CDATA outside the root element');
      if (special.text !== undefined) currentText(special.text);
      position = special.end;
    } else if (source.startsWith('</', position)) {
      const end = source.indexOf('>', position);
      const name = source.slice(position + 2, end).trim();
      const open = stack.pop();
      if (end === -1 || !open || open.name !== name) fail(`Mismatched closing tag </${name}>`);
      position = end + 1;
    } else {
      const tag = readStartTag(source, position);
      if (!tag.ok) fail(tag.message);
      else {
        const parent = stack.at(-1);
        if (parent) parent.children.push(tag.element);
        else if (root) fail('More than one root element');
        else root = tag.element;
        if (!tag.selfClosing) stack.push(tag.element);
        position = tag.end;
      }
    }
  }
  if (stack.length > 0) fail('Unclosed element');
  if (!root) throw new Error('No root element');
  return root;
}

export const childrenNamed = (element: XmlElement, name: string): readonly XmlElement[] => element.children.filter((child) => child.name === name);
export const childText = (element: XmlElement, name: string): string | undefined => childrenNamed(element, name)[0]?.text;
