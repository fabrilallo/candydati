import { describe, expect, it } from 'vitest';
import { autoMapColumns, emptyImportMapping, unknownMappingHeaders } from './mapping.js';

describe('autoMapColumns', () => {
  it('maps an Italian sheet', () => {
    expect(autoMapColumns(['Nome', 'Cognome', 'E-mail', 'Cellulare', 'LinkedIn', 'Note', 'Tag', 'CV'])).toEqual({
      firstName: 'Nome',
      lastName: 'Cognome',
      fullName: null,
      email: 'E-mail',
      phone: 'Cellulare',
      linkedin: 'LinkedIn',
      notes: 'Note',
      tags: 'Tag',
      file: 'CV',
    });
  });
  it('maps an English sheet with a full name', () => {
    const mapping = autoMapColumns(['Full Name', 'Email Address', 'Phone', 'Comments', 'Labels', 'Resume']);
    expect(mapping).toMatchObject({ fullName: 'Full Name', email: 'Email Address', phone: 'Phone', notes: 'Comments', tags: 'Labels', file: 'Resume', firstName: null });
  });
  it('treats a lone "Nome" as the full name', () => {
    expect(autoMapColumns(['Nome', 'Email'])).toMatchObject({ fullName: 'Nome', firstName: null, lastName: null });
  });
  it('treats "Nome completo" as the full name even next to "Nome"', () => {
    expect(autoMapColumns(['Nome completo', 'Mail', 'Telefono'])).toMatchObject({ fullName: 'Nome completo', email: 'Mail', phone: 'Telefono' });
  });
  it('reads a Notion export', () => {
    expect(autoMapColumns(['Name', 'Email', 'Files & media', 'Tags'])).toMatchObject({ fullName: 'Name', email: 'Email', file: 'Files & media', tags: 'Tags' });
  });
  it('is not fooled by case, accents or spaces and ignores unknown columns', () => {
    const mapping = autoMapColumns(['  TELEFONO ', 'Città', 'Stipendio', 'e mail']);
    expect(mapping).toMatchObject({ phone: '  TELEFONO ', email: 'e mail' });
    expect(Object.values(mapping).filter((value) => value !== null)).toHaveLength(2);
  });
  it('maps nothing for an empty or unrelated sheet', () => {
    expect(autoMapColumns([])).toEqual(emptyImportMapping());
    expect(autoMapColumns(['foo', 'bar'])).toEqual(emptyImportMapping());
  });
  it('uses each header once', () => {
    const mapping = autoMapColumns(['Email', 'Email']);
    expect(mapping.email).toBe('Email');
  });
});

describe('unknownMappingHeaders', () => {
  it('lists mapped headers that are not in the sheet', () => {
    expect(unknownMappingHeaders({ ...emptyImportMapping(), email: 'Mail', phone: 'Tel' }, ['Mail'])).toEqual(['Tel']);
    expect(unknownMappingHeaders(emptyImportMapping(), [])).toEqual([]);
  });
});
