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

  it('finds emails glued to other text and keeps them out of the phone numbers', () => {
    expect(extractContacts('Email:Mario.Rossi+cv@mail.example.it;tel').email).toBe('mario.rossi+cv@mail.example.it');
    expect(extractContacts('a@b.it 3331234567@mail.example.com').phones).toEqual([]);
    expect(extractContacts(`${'x'.repeat(600)}@mail.example.it`).email).toBeNull(); // a run too long to be an address
  });

  it('finishes fast on hostile text (CodeQL js/polynomial-redos)', () => {
    const started = performance.now();
    extractContacts('%'.repeat(50_000));
    extractContacts(`${'%'.repeat(50_000)}@`);
    extractContacts(`linkedin.com/in/a${'.'.repeat(50_000)}b ${')'.repeat(50_000)}`);
    extractContacts(`${'a'.repeat(500)}@b.it `.repeat(100));
    expect(performance.now() - started).toBeLessThan(200);
  });

  it('drops the punctuation that follows a linkedin url', () => {
    expect(extractContacts('linkedin.com/in/anna.bianchi.').linkedin).toBe('https://www.linkedin.com/in/anna.bianchi');
  });
});
