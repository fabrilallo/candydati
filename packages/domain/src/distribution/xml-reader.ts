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
    if (source.startsWith('<?', position)) {
      const end = source.indexOf('?>', position);
      if (end === -1) fail('Unterminated declaration');
      position = end + 2;
    } else if (source.startsWith('<!--', position)) {
      const end = source.indexOf('-->', position);
      if (end === -1) fail('Unterminated comment');
      position = end + 3;
    } else if (source.startsWith('<![CDATA[', position)) {
      const end = source.indexOf(']]>', position);
      if (end === -1) fail('Unterminated CDATA');
      if (stack.length === 0) fail('CDATA outside the root element');
      currentText(source.slice(position + 9, end));
      position = end + 3;
    } else if (source.startsWith('</', position)) {
      const end = source.indexOf('>', position);
      const name = source.slice(position + 2, end).trim();
      const open = stack.pop();
      if (end === -1 || !open || open.name !== name) fail(`Mismatched closing tag </${name}>`);
      position = end + 1;
    } else {
      const nameMatch = new RegExp(`^<(${NAME})`).exec(source.slice(position, position + 200));
      if (!nameMatch) fail('Malformed tag');
      const name = nameMatch![1]!;
      const { attributes, end } = readAttributes(source, position + nameMatch![0].length);
      const rest = /^\s*(\/?)>/.exec(source.slice(end, end + 20));
      if (!rest) fail(`Malformed tag <${name}>`);
      const element: MutableElement = { name, attributes, children: [], text: '' };
      const parent = stack.at(-1);
      if (parent) parent.children.push(element);
      else if (root) fail('More than one root element');
      else root = element;
      if (rest![1] !== '/') stack.push(element);
      position = end + rest![0].length;
    }
  }
  if (stack.length > 0) fail('Unclosed element');
  if (!root) throw new Error('No root element');
  return root;
}

export const childrenNamed = (element: XmlElement, name: string): readonly XmlElement[] => element.children.filter((child) => child.name === name);
export const childText = (element: XmlElement, name: string): string | undefined => childrenNamed(element, name)[0]?.text;
