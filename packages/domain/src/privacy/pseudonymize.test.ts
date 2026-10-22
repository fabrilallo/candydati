import { describe, expect, it } from 'vitest';
import { growthRatio, LINEAR_GROWTH_MAX } from '../testing/linear-time.js';
import { pseudonymizeText, pseudonymizeValue, REDACTED, type PersonIdentifiers } from './pseudonymize.js';

const giulia: PersonIdentifiers = {
  lastName: 'De Santis',
  email: 'g.desantis@example.test',
  phone: '+39 333 123 4567',
  linkedinUrl: 'https://www.linkedin.com/in/giulia-desantis',
};

const clean = (text: string, person: PersonIdentifiers = giulia): string => pseudonymizeText(text, person);

describe('pseudonymizeText', () => {
  it('keeps the first name and removes the surname, in any case and as a whole word', () => {
    expect(clean('Giulia De Santis, sviluppatrice. SANTIS ha guidato il team.')).toBe(
      `Giulia ${REDACTED.surname}, sviluppatrice. ${REDACTED.surname} ha guidato il team.`,
    );
    expect(clean('Santisteban è un\'altra persona')).toBe('Santisteban è un\'altra persona');
  });

  it('does not treat short particles of a surname as the surname', () => {
    expect(clean('Laurea in Informatica, università di Roma')).toBe('Laurea in Informatica, università di Roma');
    expect(pseudonymizeText('Lavoro con Di e Lo', { lastName: 'Di Lo' })).toBe(`Lavoro con Di e Lo`);
    expect(pseudonymizeText('Contatta Di Lo', { lastName: 'Di Lo' })).toBe(`Contatta ${REDACTED.surname}`);
  });

  it('removes email addresses, the person\'s own and anyone else\'s', () => {
    expect(clean('Scrivimi a g.desantis@example.test o a hr@azienda.it')).toBe(`Scrivimi a ${REDACTED.email} o a ${REDACTED.email}`);
  });

  it('removes links and profile addresses but keeps technology names with dots and slashes', () => {
    expect(clean('Profilo: https://www.linkedin.com/in/giulia-desantis e github.com/giuliads, sito www.giulia.dev')).toBe(
      `Profilo: ${REDACTED.link} e ${REDACTED.link}, sito ${REDACTED.link}`,
    );
    expect(clean('Stack: Node.js/TypeScript, Vue.js, ASP.NET')).toBe('Stack: Node.js/TypeScript, Vue.js, ASP.NET');
  });

  it.each(['+39 333 123 4567', '333 1234567', '0039 02 1234 5678', '(02) 1234-5678', '333.123.4567'])('removes the phone number %s', (phone) => {
    expect(pseudonymizeText(`Tel. ${phone}.`, { lastName: 'Rossi' })).toBe(`Tel. ${REDACTED.phone}.`);
  });

  it('keeps years, periods and ordinary numbers', () => {
    const text = 'Dal 2019 - 2021 e 2018-2021 2022, 03/2019 - 05/2021, 15 persone, budget 120000 euro, 5 anni';
    expect(pseudonymizeText(text, { lastName: 'Rossi' })).toBe(text);
  });

  it('removes full dates (a birth date) but keeps month and year', () => {
    expect(pseudonymizeText('Nata il 12/03/1990, a Roma dal 03/2015. Born 4 March 1991, 7 febbraio 1989', { lastName: 'Rossi' })).toBe(
      `Nata il ${REDACTED.date}, a Roma dal 03/2015. Born ${REDACTED.date}, ${REDACTED.date}`,
    );
  });

  it('removes the street address but keeps the city', () => {
    expect(pseudonymizeText('Residenza: Via Giuseppe Verdi 12, 20121 Milano', { lastName: 'Rossi' })).toBe(
      `Residenza: ${REDACTED.address}, 20121 Milano`,
    );
    expect(pseudonymizeText('Lives at 221 Baker Street, London', { lastName: 'Rossi' })).toBe(`Lives at ${REDACTED.address}, London`);
    expect(pseudonymizeText('Corso React 2020 e corso di Python', { lastName: 'Rossi' })).toBe('Corso React 2020 e corso di Python');
  });

  it('removes Italian tax codes and IBANs', () => {
    expect(pseudonymizeText('CF RSSMRA85T10A562S, IBAN IT60 X054 2811 1010 0000 0123 456', { lastName: 'Rossi' })).toBe(
      `CF ${REDACTED.taxCode}, IBAN ${REDACTED.iban}`,
    );
  });

  it('removes the person\'s own contacts even when written in an unusual way', () => {
    expect(pseudonymizeText('contatto: 3331234567', { lastName: 'Rossi', phone: '3331234567' })).toBe(`contatto: ${REDACTED.phone}`);
  });

  it('works without a surname and leaves text without identifiers untouched', () => {
    expect(pseudonymizeText('Esperienza in React e Postgres', { lastName: '' })).toBe('Esperienza in React e Postgres');
  });

  it('runs in linear time on hostile input', () => {
    const shapes = ['a'.repeat(1), '1 ', 'a.', 'Via A ', '+3', 'a@'];
    for (const unit of shapes) {
      expect(growthRatio((size) => pseudonymizeText(unit.repeat(size), giulia), 2000)).toBeLessThan(LINEAR_GROWTH_MAX);
    }
  });
});

describe('pseudonymizeValue', () => {
  it('cleans every string of a structure and returns a new one', () => {
    const cv = { headline: 'Giulia De Santis', skills: ['Vue', 'mail g@x.it'], years: 5, empty: null };
    const result = pseudonymizeValue(cv, giulia);
    expect(result).toEqual({ headline: `Giulia ${REDACTED.surname}`, skills: ['Vue', `mail ${REDACTED.email}`], years: 5, empty: null });
    expect(cv.headline).toBe('Giulia De Santis');
  });
});
