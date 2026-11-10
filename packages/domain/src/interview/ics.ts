/** An iCalendar invite (RFC 5545 / iTIP RFC 5546) for one interview, written by hand: a few properties, no parser. */

export interface IcsPerson {
  readonly name: string;
  readonly email: string;
}

export interface IcsEvent {
  readonly method: 'REQUEST' | 'CANCEL';
  readonly uid: string;
  /** Raised on every change of time or cancellation, so calendars replace the earlier version. */
  readonly sequence: number;
  readonly stamp: Date;
  readonly start: Date;
  readonly end: Date;
  readonly summary: string;
  readonly description: string;
  readonly location: string | null;
  readonly organizer: IcsPerson;
  readonly attendees: readonly IcsPerson[];
  readonly productId: string;
}

const LINE_OCTETS = 75;

const utc = (instant: Date): string => instant.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

const isControl = (char: string): boolean => {
  const code = char.charCodeAt(0);
  return code < 0x20 || code === 0x7f;
};
/** Control characters (line breaks included) become one space each run. */
const withoutControls = (value: string): string =>
  Array.from(value)
    .filter((char, index, chars) => !(isControl(char) && index > 0 && isControl(chars[index - 1] ?? '')))
    .map((char) => (isControl(char) ? ' ' : char))
    .join('');

/** A value on one line, so nothing can start a new property. */
const oneLine = (value: string): string => withoutControls(value).trim();

const utf8Octets = (char: string): number => {
  const code = char.codePointAt(0) ?? 0;
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  return code < 0x10000 ? 3 : 4;
};

const text = (value: string): string =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .split('\n')
    .map(withoutControls)
    .join('\\n');

/** A parameter value (CN), always quoted; DQUOTE is not allowed inside. */
const param = (value: string): string => `"${oneLine(value).replace(/"/g, '')}"`;

const address = (email: string): string => `mailto:${oneLine(email).replace(/[\s<>"]/g, '')}`;

/** Folds a content line into chunks of at most 75 octets, never splitting a UTF-8 character. */
function fold(line: string): string {
  const chunks: string[] = [];
  let current = '';
  let octets = 0;
  for (const char of line) {
    const size = utf8Octets(char);
    const limit = chunks.length === 0 ? LINE_OCTETS : LINE_OCTETS - 1;
    if (octets + size > limit) {
      chunks.push(current);
      current = '';
      octets = 0;
    }
    current += char;
    octets += size;
  }
  chunks.push(current);
  return chunks.join('\r\n ');
}

const attendee = (person: IcsPerson): string =>
  `ATTENDEE;CN=${param(person.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:${address(person.email)}`;

export function buildIcs(event: IcsEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${oneLine(event.productId)}`,
    'CALSCALE:GREGORIAN',
    `METHOD:${event.method}`,
    'BEGIN:VEVENT',
    `UID:${oneLine(event.uid)}`,
    `SEQUENCE:${Math.max(0, Math.trunc(event.sequence))}`,
    `DTSTAMP:${utc(event.stamp)}`,
    `DTSTART:${utc(event.start)}`,
    `DTEND:${utc(event.end)}`,
    `SUMMARY:${text(event.summary)}`,
    `DESCRIPTION:${text(event.description)}`,
    ...(event.location ? [`LOCATION:${text(event.location)}`] : []),
    `STATUS:${event.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    `ORGANIZER;CN=${param(event.organizer.name)}:${address(event.organizer.email)}`,
    ...event.attendees.map(attendee),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
