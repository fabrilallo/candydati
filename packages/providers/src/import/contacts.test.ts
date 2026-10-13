import { describe, expect, it } from 'vitest';
import { extractContacts } from './contacts.js';

describe('extractContacts', () => {
  const cv = `MARIO ROSSI
Backend Developer
Via Roma 12, Milano
mario.rossi@gmail.com | +39 333 123 4567 | www.linkedin.com/in/mario-rossi/
Esperienza 2019-2023`;

  it('extracts email, phone, linkedin and name from a typical CV', () => {
    expect(extractContacts(cv)).toEqual({
      email: 'mario.rossi@gmail.com',
      phones: ['+393331234567'],
      linkedin: 'https://www.linkedin.com/in/mario-rossi',
      fullName: { value: 'Mario Rossi', confidence: 'high' },
    });
  });

  it('skips implausible emails and picks the first good one', () => {
    expect(extractContacts('noreply@x.com logo@2x.png Info: Anna.B@Example.IT').email).toBe('anna.b@example.it');
    expect(extractContacts('nothing here').email).toBeNull();
  });

  it('normalises Italian and international phone numbers', () => {
    const phones = extractContacts('Tel 333-1234567, fisso 02 1234567, 0039 347 1234567, +44 20 7946 0958, +1 (415) 555-2671').phones;
    expect(phones).toEqual(expect.arrayContaining(['+393331234567', '+390212345 67'.replace(' ', ''), '+393471234567', '+442079460958', '+14155552671']));
    expect(phones).toHaveLength(5);
  });

  it('ignores dates, years and short digit runs', () => {
    expect(extractContacts('2019 - 2021, 01/2020, 12345').phones).toEqual([]);
  });

  it('normalises linkedin urls', () => {
    expect(extractContacts('it.linkedin.com/in/anna-bianchi-123).').linkedin).toBe('https://www.linkedin.com/in/anna-bianchi-123');
    expect(extractContacts('no profile').linkedin).toBeNull();
  });

  it('scores the name by position and label', () => {
    expect(extractContacts('Curriculum Vitae\nGiulia de Santis\nMilano').fullName).toEqual({ value: 'Giulia de Santis', confidence: 'medium' });
    expect(extractContacts('Nome e cognome: Luca Verdi').fullName).toEqual({ value: 'Luca Verdi', confidence: 'high' });
    expect(extractContacts('a\nb\nc\nd\nPaolo Neri').fullName).toEqual({ value: 'Paolo Neri', confidence: 'low' });
    expect(extractContacts('Curriculum Vitae\nSenior Software Engineer\nlorem ipsum').fullName).toBeNull();
    expect(extractContacts('Solo').fullName).toBeNull();
  });
});
