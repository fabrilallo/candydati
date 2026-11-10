import { describe, expect, it } from 'vitest';
import { buildInterviewInvitation, buildInterviewNotice, formatInterviewTime, interviewOfBody, renderInterviewLinks } from './emails.js';

const slots = [new Date('2026-11-16T09:00:00Z'), new Date('2026-11-17T13:30:00Z')];
const invitation = (locale: 'it' | 'en', withSlots = slots) =>
  buildInterviewInvitation({ locale, interviewId: 'int_1', firstName: 'Anna', organizationName: 'Acme', jobTitle: 'Backend developer', stageLabel: 'Colloquio tecnico', durationMinutes: 60, mode: 'video', slots: withSlots, timeZone: 'Europe/Rome' });

describe('the invitation email', () => {
  it('is stored with placeholders, never with a link', () => {
    const { subject, text } = invitation('it');
    expect(subject).toBe('Colloquio per Backend developer: scegli quando');
    expect(text).toContain('60 minuti, in videochiamata');
    expect(text).toContain('{{interview_link:int_1}}');
    expect(text).toContain('{{interview_slot:int_1:2026-11-16T09:00:00.000Z}}');
    expect(text).not.toContain('http');
    expect(interviewOfBody(text)).toBe('int_1');
    expect(interviewOfBody('Ciao, nessun colloquio qui')).toBeNull();
  });

  it('gets the page link and one link per time at delivery', () => {
    const sent = renderInterviewLinks(invitation('en').text, 'int_1', 'https://jobs.example.com/', 'secret123');
    expect(sent).toContain('Every free time is here, with no account: https://jobs.example.com/interview/secret123');
    expect(sent).toContain('https://jobs.example.com/interview/secret123?slot=2026-11-16T09%3A00%3A00.000Z');
    expect(sent).not.toContain('{{');
  });

  it('leaves the placeholders of another interview alone', () => {
    const sent = renderInterviewLinks(invitation('it').text, 'int_2', 'https://x.example', 's');
    expect(sent).toContain('{{interview_link:int_1}}');
  });

  it('still invites without times, pointing at the page', () => {
    const { text } = invitation('en', []);
    expect(text).not.toContain('Here are some free times');
    expect(text).toContain('{{interview_link:int_1}}');
  });
});

describe('times in emails', () => {
  it('names the day, the time and the time zone', () => {
    expect(formatInterviewTime(slots[0]!, 'it', 'Europe/Rome')).toMatch(/^lunedì 16 novembre, 10:00 \(.+\)$/);
    expect(formatInterviewTime(slots[0]!, 'en', 'Europe/London')).toMatch(/^Monday,? (16 November|November 16), 09:00 \(.+\)$/);
  });
});

describe('the notice with the invite', () => {
  const base = { organizationName: 'Acme', jobTitle: 'Backend developer', stageLabel: 'Tecnico', start: slots[0]!, durationMinutes: 60, mode: 'onsite' as const, location: 'Via Roma 1, Milano', timeZone: 'Europe/Rome' };

  it('tells the candidate when and where, with the page to move or cancel', () => {
    const { subject, text } = buildInterviewNotice({ ...base, locale: 'it', kind: 'booked', recipientName: 'Anna', candidateName: null, manageLink: 'https://x/interview/s' });
    expect(subject).toMatch(/^Colloquio confermato: Backend developer, lunedì 16 novembre, 10:00/);
    expect(text).toContain('Dove: Via Roma 1, Milano');
    expect(text).toContain('Per spostarlo o annullarlo: https://x/interview/s');
  });

  it('tells an interviewer whom they meet, and cancels without a link', () => {
    const { subject, text } = buildInterviewNotice({ ...base, locale: 'en', kind: 'cancelled', recipientName: 'Luca', candidateName: 'Anna Rossi', manageLink: null });
    expect(subject).toContain('Interview cancelled: Backend developer with Anna Rossi');
    expect(text).toContain('is cancelled');
    expect(text).not.toContain('To move or cancel');
  });

  it('reminds the candidate the day before, pointing at the confirmation to change it', () => {
    const it_ = buildInterviewNotice({ ...base, locale: 'it', kind: 'reminder', recipientName: 'Anna', candidateName: null, manageLink: null });
    expect(it_.subject).toMatch(/^Promemoria colloquio: Backend developer, lunedì 16 novembre/);
    expect(it_.text).toContain('è confermato per lunedì 16 novembre, 10:00');
    expect(it_.text).toContain('link dell’email di conferma');
    expect(buildInterviewNotice({ ...base, locale: 'en', kind: 'reminder', recipientName: 'Anna', candidateName: null, manageLink: null }).text).toContain('is still on for');
  });
});
