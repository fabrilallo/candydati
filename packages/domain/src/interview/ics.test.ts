import { describe, expect, it } from 'vitest';
import { buildIcs, type IcsEvent } from './ics.js';

const event: IcsEvent = {
  method: 'REQUEST',
  uid: 'interview-123@example.com',
  sequence: 0,
  stamp: new Date('2026-11-10T09:00:00Z'),
  start: new Date('2026-11-16T09:00:00Z'),
  end: new Date('2026-11-16T10:00:00Z'),
  summary: 'Colloquio tecnico: Backend developer, Rossi; Bianchi',
  description: 'Line one\nLine two, with a comma',
  location: 'https://meet.example.com/abc',
  organizer: { name: 'Acme Hiring', email: 'jobs@example.com' },
  attendees: [
    { name: 'Anna Rossi', email: 'anna@example.com' },
    { name: 'Luca "the dev" Neri', email: 'luca@example.com' },
  ],
  productId: '-//Acme//Interviews//EN',
};

const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('an invite file', () => {
  it('is a REQUEST in UTC, with CRLF lines and the attendees', () => {
    const ics = buildIcs(event);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Acme//Interviews//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:REQUEST\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('\r\n').every((line) => !line.includes('\n'))).toBe(true);
    const text = unfold(ics);
    expect(text).toContain('UID:interview-123@example.com');
    expect(text).toContain('SEQUENCE:0');
    expect(text).toContain('DTSTAMP:20261110T090000Z');
    expect(text).toContain('DTSTART:20261116T090000Z');
    expect(text).toContain('DTEND:20261116T100000Z');
    expect(text).toContain('STATUS:CONFIRMED');
    expect(text).toContain('ORGANIZER;CN="Acme Hiring":mailto:jobs@example.com');
    expect(text).toContain('ATTENDEE;CN="Anna Rossi";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:anna@example.com');
    expect(text).toContain('ATTENDEE;CN="Luca the dev Neri";ROLE=REQ-PARTICIPANT');
  });

  it('escapes text and folds long lines at 75 octets', () => {
    const ics = buildIcs({ ...event, description: `${'é'.repeat(60)}\nsecond; line, here` });
    const lines = ics.split('\r\n');
    expect(lines.every((line) => Buffer.byteLength(line, 'utf8') <= 75)).toBe(true);
    const text = unfold(ics);
    expect(text).toContain('SUMMARY:Colloquio tecnico: Backend developer\\, Rossi\\; Bianchi');
    expect(text).toContain(`DESCRIPTION:${'é'.repeat(60)}\\nsecond\\; line\\, here`);
  });

  it('cancels with the same uid and a higher sequence', () => {
    const text = unfold(buildIcs({ ...event, method: 'CANCEL', sequence: 2 }));
    expect(text).toContain('METHOD:CANCEL');
    expect(text).toContain('STATUS:CANCELLED');
    expect(text).toContain('SEQUENCE:2');
    expect(text).toContain('UID:interview-123@example.com');
  });

  it('drops line breaks from header-like values so nothing can inject a property', () => {
    const text = unfold(buildIcs({ ...event, uid: 'x\r\nATTENDEE:mailto:evil@example.com', organizer: { name: 'A\r\nB', email: 'jobs@example.com' } }));
    expect(text.split('\r\n').some((line) => line.startsWith('ATTENDEE:mailto:evil'))).toBe(false);
    expect(text).toContain('UID:x ATTENDEE:mailto:evil@example.com');
    expect(text).toContain('ORGANIZER;CN="A B":mailto:jobs@example.com');
  });
});
