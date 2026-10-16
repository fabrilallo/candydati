import { describe, expect, it } from 'vitest';
import { detectColumns } from './columns.js';
import { ASSUMED_HEADERS } from './inrecruiting-fixtures.js';

describe('detectColumns', () => {
  it('recognises the assumed Italian headers, and reports score and unknown columns apart', () => {
    const { columns, ignored, unrecognized, missing } = detectColumns(ASSUMED_HEADERS);
    expect(columns).toEqual({
      firstName: 'Nome',
      lastName: 'Cognome',
      fullName: null,
      email: 'Email',
      phone: 'Telefono',
      notes: 'Note',
      tags: 'Tag',
      file: 'CV',
      job: 'Annuncio',
      jobCode: 'Codice annuncio',
      stage: 'Fase',
      appliedAt: 'Data candidatura',
      outcome: 'Esito',
      source: 'Fonte',
    });
    expect(ignored).toEqual(['Valutazione']);
    expect(unrecognized).toEqual(['Taglia scarpe']);
    expect(missing).toEqual([]);
  });

  it('recognises English headers regardless of case, accents and punctuation', () => {
    const { columns, missing } = detectColumns(['FIRST NAME', 'Last_Name', 'E-mail', 'Phone', 'Vacancy', 'Stage', 'Applied at', 'Outcome', 'Source', 'Notes', 'Tags', 'File']);
    expect(columns).toMatchObject({ firstName: 'FIRST NAME', lastName: 'Last_Name', email: 'E-mail', job: 'Vacancy', stage: 'Stage', appliedAt: 'Applied at', outcome: 'Outcome', source: 'Source', file: 'File' });
    expect(missing).toEqual([]);
    const accented = detectColumns(['Nominativo', 'Posizióne', 'Státo']);
    expect(accented.columns).toMatchObject({ fullName: 'Nominativo', job: 'Posizióne', stage: 'Státo' });
  });

  it('takes a lone "Nome" as the full name, and a specific code header before the generic job one', () => {
    const { columns } = detectColumns(['Nome', 'Posizione', 'Codice posizione']);
    expect(columns).toMatchObject({ fullName: 'Nome', firstName: null, job: 'Posizione', jobCode: 'Codice posizione' });
  });

  it('ignores any header that looks like a score or a rating, even one that mentions notes', () => {
    const { ignored, columns } = detectColumns(['Nome e cognome', 'Annuncio', 'Punteggio', 'Rating colloquio', 'Note valutazione', 'Stelle', 'Note']);
    expect(ignored).toEqual(['Punteggio', 'Rating colloquio', 'Note valutazione', 'Stelle']);
    expect(columns.notes).toBe('Note');
  });

  it('says what is missing: a name and a job', () => {
    expect(detectColumns(['Email', 'Stato']).missing).toEqual(['name', 'job']);
    expect(detectColumns(['Nome', 'Email']).missing).toEqual(['job']);
    expect(detectColumns(['First name', 'Job']).missing).toEqual(['name']);
  });
});
