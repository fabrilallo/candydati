import { describe, expect, it } from 'vitest';
import {
  bookInterviewInputSchema,
  calendarFeedInputSchema,
  canCandidateChange,
  interviewPath,
  proposeInterviewInputSchema,
} from './interview.js';
import { DEFAULT_WORKING_HOURS } from './availability.js';

const feed = (url: string, timeZone = 'Europe/Rome') => calendarFeedInputSchema.safeParse({ url, timeZone, workingHours: DEFAULT_WORKING_HOURS });

describe('calendar feed input', () => {
  it('takes an https or webcal secret address and reads webcal as https', () => {
    const google = feed('https://calendar.google.com/calendar/ical/x%40group/private-abc/basic.ics');
    expect(google.success).toBe(true);
    const webcal = feed('webcal://p01-caldav.icloud.com/published/2/abc');
    expect(webcal.success && webcal.data.url).toBe('https://p01-caldav.icloud.com/published/2/abc');
  });

  it('refuses plain http, IP addresses, other schemes and unknown time zones', () => {
    expect(feed('http://calendar.example.com/a.ics').success).toBe(false);
    expect(feed('https://127.0.0.1/a.ics').success).toBe(false);
    expect(feed('file:///etc/passwd').success).toBe(false);
    expect(feed('https://calendar.example.com/a.ics', 'Mars/Olympus').success).toBe(false);
  });
});

describe('interview inputs', () => {
  it('proposes with a mode and, optionally, other interviewers', () => {
    expect(proposeInterviewInputSchema.safeParse({ stageId: 's1', mode: 'video', location: 'https://meet.example.com/x' }).success).toBe(true);
    expect(proposeInterviewInputSchema.safeParse({ stageId: 's1', mode: 'video', interviewers: [] }).success).toBe(false);
    expect(proposeInterviewInputSchema.safeParse({ stageId: 's1', mode: 'carrier pigeon' }).success).toBe(false);
    expect(proposeInterviewInputSchema.safeParse({ stageId: 's1', mode: 'video', score: 5 }).success).toBe(false);
  });

  it('books an exact instant', () => {
    expect(bookInterviewInputSchema.safeParse({ slot: '2026-11-16T09:00:00.000Z' }).success).toBe(true);
    expect(bookInterviewInputSchema.safeParse({ slot: 'tomorrow' }).success).toBe(false);
  });
});

describe('booking page', () => {
  it('links to the page, with a preselected time that still needs a confirmation', () => {
    expect(interviewPath('abc')).toBe('/interview/abc');
    expect(interviewPath('abc', new Date('2026-11-16T09:00:00Z'))).toBe('/interview/abc?slot=2026-11-16T09%3A00%3A00.000Z');
  });

  it('lets the candidate change until 12 hours before', () => {
    const start = new Date('2026-11-16T09:00:00Z');
    expect(canCandidateChange(start, new Date('2026-11-15T21:00:00Z'))).toBe(true);
    expect(canCandidateChange(start, new Date('2026-11-15T21:00:01Z'))).toBe(false);
  });
});
