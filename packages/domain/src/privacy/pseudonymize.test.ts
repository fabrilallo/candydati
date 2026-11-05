import { describe, expect, it } from 'vitest';
import { expectLinearOnHostileInput, hostileText } from '../testing/linear-time.js';
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

  it('removes the street address', () => {
    expect(pseudonymizeText('Residenza: Via Giuseppe Verdi 12, 20121 Milano', { lastName: 'Rossi' })).toBe(`Residenza: ${REDACTED.address}`);
    expect(pseudonymizeText('Lives at 221 Baker Street, London', { lastName: 'Rossi' })).toBe(`Lives at ${REDACTED.address}, London`);
    expect(pseudonymizeText('Corso React 2020 e corso di Python', { lastName: 'Rossi' })).toBe('Corso React 2020 e corso di Python');
  });

  it('removes handles without a domain, not code or times', () => {
    expect(clean('Instagram @mario.rossi, Telegram @mrossi_92.')).toBe(`Instagram ${REDACTED.handle}, Telegram ${REDACTED.handle}.`);
    expect(clean('(@mrossi)')).toBe(`(${REDACTED.handle})`);
    expect(clean('Vediamoci alle 5 @ 10am, poi @ casa; a@b non è un handle')).toBe('Vediamoci alle 5 @ 10am, poi @ casa; a@b non è un handle');
    expect(clean('scrivi a hr@azienda.it')).toBe(`scrivi a ${REDACTED.email}`);
    expect(clean('@1 e @_ e @a')).toBe('@1 e @_ e @a');
  });

  it('removes social profiles on other domains, short forms and hosted pages', () => {
    const cases = [
      'linkedin.it/in/mario-rossi',
      'it.linkedin.com/in/mario-rossi',
      'LinkedIn: in/mario-rossi',
      'linkedin.com/in/mario-rossi',
      'mariorossi.github.io/portfolio',
      't.me/mrossi',
      'wa.me/393331234567',
      'x.com/mrossi',
      'github.com/mrossi',
    ];
    for (const profile of cases) expect(clean(`Profilo ${profile} fine`)).toBe(`Profilo ${REDACTED.link} fine`);
    expect(clean('in/out e and/or in/ uscita')).toBe('in/out e and/or in/ uscita');
  });

  it('removes Italian tax codes and IBANs', () => {
    expect(pseudonymizeText('CF RSSMRA85T10A562S, IBAN IT60 X054 2811 1010 0000 0123 456', { lastName: 'Rossi' })).toBe(
      `CF ${REDACTED.taxCode}, IBAN ${REDACTED.iban}`,
    );
  });

  it('removes the person\'s own contacts even when written in an unusual way', () => {
    expect(pseudonymizeText('contatto: 3331234567', { lastName: 'Rossi', phone: '3331234567' })).toBe(`contatto: ${REDACTED.phone}`);
  });

  it('removes handles with dots and underscores, at the start of a line too', () => {
    expect(clean('@nome\n@nome.cognome e @nome_cognome.')).toBe(`${REDACTED.handle}\n${REDACTED.handle} e ${REDACTED.handle}.`);
    expect(clean('ci vediamo @ 10am e @10')).toBe('ci vediamo @ 10am e @10');
  });

  it('removes messaging ids written after their app name', () => {
    const rossi = { lastName: 'Rossi' };
    expect(pseudonymizeText('Skype: live:mario.r92, Discord: mrossi#1234, skype:mario.r92?call', rossi)).toBe(
      `Skype: ${REDACTED.handle}, Discord: ${REDACTED.handle}, skype:${REDACTED.handle}`,
    );
    expect(pseudonymizeText('WhatsApp: +39 333 1234567, telegram.me/mrossi', rossi)).toBe(`WhatsApp: ${REDACTED.phone}, ${REDACTED.link}`);
    expect(pseudonymizeText('Sviluppo bot Telegram e integrazioni Skype', rossi)).toBe('Sviluppo bot Telegram e integrazioni Skype');
  });

  it.each(['+1 (555) 123-4567', '+44 20 7946 0958', '+39 02 1234 5678 int. 23', '02 1234567 ext. 12', '+39 333 12 34 567'])(
    'removes the phone number %s with its extension',
    (phone) => {
      expect(pseudonymizeText(`Tel. ${phone}, grazie`, { lastName: 'Rossi' })).toBe(`Tel. ${REDACTED.phone}, grazie`);
    },
  );

  it('removes postal codes and cities that follow a street address', () => {
    const rossi = { lastName: 'Rossi' };
    expect(pseudonymizeText('Residenza: Viale dei Mille 3/A, 20129 Milano (MI). Disponibile', rossi)).toBe(`Residenza: ${REDACTED.address}. Disponibile`);
    expect(pseudonymizeText('Indirizzo: Piazza Garibaldi, 7 - 80142 Napoli', rossi)).toBe(`Indirizzo: ${REDACTED.address}`);
    expect(pseudonymizeText('Flat 2, 221B Baker Street, London NW1 6XE', rossi)).toBe(`Flat 2, ${REDACTED.address}`);
    expect(pseudonymizeText('500 Market Way, San Francisco, CA 94105', rossi)).toBe(REDACTED.address);
    expect(pseudonymizeText('Postcode SW1A 1AA', rossi)).toBe(`Postcode ${REDACTED.address}`);
    expect(pseudonymizeText('Team di 20121 persone? no: 15 persone a Milano', rossi)).toBe('Team di 20121 persone? no: 15 persone a Milano');
  });

  it('removes tax codes with omocodia, IBANs without spaces and VAT numbers', () => {
    const rossi = { lastName: 'Rossi' };
    expect(pseudonymizeText('CF RSSMRA85T10A56RS, IBAN it60x0542811101000000123456', rossi)).toBe(`CF ${REDACTED.taxCode}, IBAN ${REDACTED.iban}`);
    expect(pseudonymizeText('P.IVA 01234567890, Partita IVA: IT01234567890, VAT IT 01234567890', rossi)).toBe(
      `P.IVA ${REDACTED.vat}, Partita IVA: ${REDACTED.vat}, VAT ${REDACTED.vat}`,
    );
  });

  it('removes personal sites without www, not technology names', () => {
    const rossi = { lastName: 'Rossi' };
    expect(pseudonymizeText('Portfolio: mariorossi.it, blog giulia.dev/about e mrossi.me', rossi)).toBe(
      `Portfolio: ${REDACTED.link}, blog ${REDACTED.link} e ${REDACTED.link}`,
    );
    expect(pseudonymizeText('Node.js, Vue.js, ASP.NET, socket.io, D3.js, Next.js', rossi)).toBe('Node.js, Vue.js, ASP.NET, socket.io, D3.js, Next.js');
  });

  it('removes names in a references section, up to an empty line', () => {
    const cv = 'Referenze:\nMario Bianchi, Responsabile IT, Acme, tel 02 1234567\nAnna Maria Verdi - anna@acme.it\n\nCompetenze: Java, Spring Boot';
    expect(pseudonymizeText(cv, { lastName: 'Rossi' })).toBe(
      `Referenze:\n${REDACTED.name}, Responsabile IT, Acme, tel ${REDACTED.phone}\n${REDACTED.name} - ${REDACTED.email}\n\nCompetenze: Java, Spring Boot`,
    );
    expect(pseudonymizeText('References: John Smith (CTO at Acme)', { lastName: 'Rossi' })).toBe(`References: ${REDACTED.name} (CTO at Acme)`);
  });

  it('removes names after a title or next to a contact', () => {
    const rossi = { lastName: 'Rossi' };
    expect(pseudonymizeText('Ho lavorato con il Dott. Luca Neri e con Ing. Paola Gialli', rossi)).toBe(
      `Ho lavorato con il Dott. ${REDACTED.name} e con Ing. ${REDACTED.name}`,
    );
    expect(pseudonymizeText('Contatto: Luca Neri, luca@acme.it', rossi)).toBe(`Contatto: ${REDACTED.name}, ${REDACTED.email}`);
    expect(pseudonymizeText('Spring Boot, Google Cloud e React Native', rossi)).toBe('Spring Boot, Google Cloud e React Native');
  });

  it('removes the names of known people, such as the organization members', () => {
    const person = { lastName: 'Rossi', otherNames: ['Chiara Fontana', 'Bo'] };
    expect(pseudonymizeText('Nota: sentito da chiara fontana, poi Chiara ha confermato. Bo resta.', person)).toBe(
      `Nota: sentito da ${REDACTED.name}, poi Chiara ha confermato. Bo resta.`,
    );
  });

  it('works without a surname and leaves text without identifiers untouched', () => {
    expect(pseudonymizeText('Esperienza in React e Postgres', { lastName: '' })).toBe('Esperienza in React e Postgres');
  });

  it('runs in linear time on hostile input', () => {
    const shapes = ['Referenze: Aa ', 'Dott. Aa ', 'Aa Bb, a@b.it ', 'skype: a', '1 Aa Way, ', 'P.IVA 1', 'a.it/', 'a'.repeat(1), '1 ', 'a.', 'Via A ', '+3', 'a@', '@a.', 'linkedin ', 'a.github.io', 't.me/', 'x.'];
    for (const unit of shapes) {
      expectLinearOnHostileInput((length) => { pseudonymizeText(hostileText(unit, length), giulia); });
    }
  }, 20_000);
});

describe('pseudonymizeValue', () => {
  it('cleans every string of a structure and returns a new one', () => {
    const cv = { headline: 'Giulia De Santis', skills: ['Vue', 'mail g@x.it'], years: 5, empty: null };
    const result = pseudonymizeValue(cv, giulia);
    expect(result).toEqual({ headline: `Giulia ${REDACTED.surname}`, skills: ['Vue', `mail ${REDACTED.email}`], years: 5, empty: null });
    expect(cv.headline).toBe('Giulia De Santis');
  });
});
