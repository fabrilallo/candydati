import { describe, expect, it } from 'vitest';
import type { ImportExistingRef, ParsedImportCv, ParsedImportRow } from './import.js';
import { autoMapColumns, emptyImportMapping } from './mapping.js';
import { collectImportEmails, matchImport } from './matching.js';

const cv = (fileName: string, extra: Partial<ParsedImportCv> = {}): ParsedImportCv => ({ fileName, key: `k/${fileName}`, text: 'cv text', extraction: null, ...extra });
const row = (index: number, cells: Record<string, string>): ParsedImportRow => ({ index, cells });
const HEADERS = ['Nome', 'Cognome', 'Email', 'Telefono', 'LinkedIn', 'Note', 'Tag', 'CV'];
const mapping = autoMapColumns(HEADERS);
const run = (cvs: ParsedImportCv[], rows: ParsedImportRow[], existingByEmail: Record<string, ImportExistingRef> = {}) => matchImport({ cvs, rows, mapping, existingByEmail });

describe('matchImport pairing', () => {
  it('pairs by email with high confidence even when the names differ in spelling', () => {
    const [item, ...rest] = run(
      [cv('scan0001.pdf', { email: 'M.Rossi@Example.com', name: 'M. Rossi' })],
      [row(2, { Nome: 'Mario', Cognome: 'Rossi', Email: 'm.rossi@example.com', Telefono: '333 1234567' })],
    );
    expect(rest).toEqual([]);
    expect(item).toMatchObject({ confidence: 'high', basis: 'email', cv: { fileName: 'scan0001.pdf' }, sources: { rows: [2], files: ['scan0001.pdf'] }, included: true });
    expect(item?.candidate).toMatchObject({ firstName: 'Mario', lastName: 'Rossi', email: 'm.rossi@example.com', phone: '333 1234567' });
  });

  it('pairs by the file name column, ignoring folders, case and extension', () => {
    const [item] = run([cv('cvs/2024/GBianchi_final.PDF', { name: 'Giulia B.' })], [row(2, { Nome: 'Giulia', Cognome: 'Bianchi', CV: 'gbianchi_final.docx' })]);
    expect(item).toMatchObject({ confidence: 'high', basis: 'file_name', sources: { rows: [2] } });
  });

  it('pairs by normalised full name with medium confidence: order, accents and case', () => {
    const items = run([cv('x.pdf', { name: 'ROSSI Niccolò' })], [row(2, { Nome: 'Niccolo', Cognome: 'Rossi' })]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ confidence: 'medium', basis: 'name', included: true });
  });

  it('takes the name from the file name when the CV text has none', () => {
    const [item] = run([cv('Mario_Rossi_CV.pdf')], [row(2, { Nome: 'Mario', Cognome: 'Rossi' })]);
    expect(item).toMatchObject({ basis: 'name', confidence: 'medium' });
  });

  it('pairs a typo with low confidence and leaves it out of the default selection', () => {
    const [item] = run([cv('x.pdf', { name: 'Francesca Esposito' })], [row(2, { Nome: 'Francesco', Cognome: 'Esposito' })]);
    expect(item).toMatchObject({ confidence: 'low', basis: 'fuzzy_name', included: false });
  });

  it('does not pair distinct names and keeps both as separate items', () => {
    const items = run([cv('x.pdf', { name: 'Mario Rossi', email: 'mario@x.it' })], [row(2, { Nome: 'Luca', Cognome: 'Verdi', Email: 'luca@x.it' })]);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.cv !== null)).toEqual([true, false]);
    expect(items[1]?.flags).toContain('no_cv');
    expect(items[1]?.included).toBe(false);
  });

  it('does not guess between homonyms or between equally close names', () => {
    const homonyms = run(
      [cv('x.pdf', { name: 'Marco Neri' })],
      [row(2, { Nome: 'Marco', Cognome: 'Neri', Email: 'a@x.it' }), row(3, { Nome: 'Marco', Cognome: 'Neri', Email: 'b@x.it' })],
    );
    expect(homonyms).toHaveLength(3);
    expect(homonyms[0]?.cv).not.toBeNull();
    expect(homonyms[0]?.sources.rows).toEqual([]);
    const close = run([cv('x.pdf', { name: 'Marco Nerio' })], [row(2, { Nome: 'Marco', Cognome: 'Neri' }), row(3, { Nome: 'Marco', Cognome: 'Nero' })]);
    expect(close).toHaveLength(3);
  });

  it('lets a sure match win over a weaker guess for the same row', () => {
    const items = run(
      [cv('a.pdf', { name: 'Maria Verdi' }), cv('b.pdf', { name: 'Anna Blu', email: 'maria@x.it' })],
      [row(2, { Nome: 'Maria', Cognome: 'Verdi', Email: 'maria@x.it' })],
    );
    const byFile = Object.fromEntries(items.map((i) => [i.cv?.fileName ?? 'row', i]));
    expect(byFile['b.pdf']).toMatchObject({ basis: 'email', sources: { rows: [2] } });
    expect(byFile['a.pdf']?.sources.rows).toEqual([]);
  });

  it('lowers the confidence when the names match but the emails differ (homonym risk)', () => {
    const [item] = run([cv('x.pdf', { name: 'Paolo Gialli', email: 'p1@x.it' })], [row(2, { Nome: 'Paolo', Cognome: 'Gialli', Email: 'p2@y.it' })]);
    expect(item).toMatchObject({ confidence: 'low', flags: expect.arrayContaining(['email_conflict']) });
    expect(item?.conflicts).toEqual([{ field: 'email', kind: 'sources', kept: 'p2@y.it', other: 'p1@x.it' }]);
  });

  it('lists a phone conflict between CV and row, keeping the row value', () => {
    const [item] = run([cv('x.pdf', { email: 'a@x.it', phone: '+39 347 0000000' })], [row(2, { Nome: 'A', Cognome: 'B', Email: 'a@x.it', Telefono: '333 1111111' })]);
    expect(item?.conflicts).toEqual([{ field: 'phone', kind: 'sources', kept: '333 1111111', other: '+39 347 0000000' }]);
    expect(item?.candidate.phone).toBe('333 1111111');
  });
  it('does not call the same phone written two ways a conflict', () => {
    const [item] = run([cv('x.pdf', { email: 'a@x.it', phone: '+39 333 1111111' })], [row(2, { Nome: 'A', Cognome: 'B', Email: 'a@x.it', Telefono: '333-1111111' })]);
    expect(item?.conflicts).toEqual([]);
  });
});

describe('matchImport duplicates and single sources', () => {
  it('merges rows with the same email, keeping the first values and joining notes and tags', () => {
    const items = run([], [
      row(2, { Nome: 'Mario', Cognome: 'Rossi', Email: 'MARIO@x.it', Note: 'Ottimo colloquio', Tag: 'java, senior' }),
      row(7, { Nome: '', Cognome: '', Email: 'mario@x.it', Telefono: '333 9', Note: 'Richiamare', Tag: 'senior; remoto' }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.candidate).toMatchObject({ firstName: 'Mario', phone: '333 9', note: 'Ottimo colloquio\n\nRichiamare', tags: ['java', 'senior', 'remoto'] });
    expect(items[0]?.sources.rows).toEqual([2, 7]);
    expect(items[0]?.flags).toContain('duplicate_merged');
  });

  it('merges two CVs of the same person (same email) into one item with both files as sources', () => {
    const items = run([cv('old.pdf', { email: 'a@x.it', name: 'Ada Lovelace' }), cv('new.pdf', { email: 'A@x.it', name: 'Ada Lovelace' })], []);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ cv: { fileName: 'old.pdf' }, sources: { files: ['old.pdf', 'new.pdf'] }, flags: expect.arrayContaining(['duplicate_merged']) });
  });

  it('keeps rows without email separate, flagged no_email with medium confidence', () => {
    const items = run([], [row(2, { Nome: 'Anna', Cognome: 'Rossi' }), row(3, { Nome: 'Anna', Cognome: 'Rossi' })]);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.flags.includes('no_email') && i.confidence === 'medium')).toBe(true);
  });

  it('proposes a CV alone with the identifiers found in its text', () => {
    const [item] = run([cv('Laura_Neri.pdf', { email: 'laura@x.it', phone: '+39 02 123456', name: 'Laura Neri', extraction: { headline: 'Data engineer', experiences: [], education: [], skills: [], languages: [] } })], []);
    expect(item).toMatchObject({ confidence: 'high', basis: 'single', headline: 'Data engineer', included: true, flags: [] });
    expect(item?.candidate).toMatchObject({ firstName: 'Laura', lastName: 'Neri', email: 'laura@x.it', phone: '+39 02 123456' });
  });

  it('flags a name that is a single word', () => {
    const [item] = run([cv('Madonna.pdf', { email: 'm@x.it' })], []);
    expect(item?.flags).toContain('incomplete_name');
  });

  it('drops names that carry a link or an address and flags the item', () => {
    const [item] = run([], [row(2, { Nome: 'https://evil.example/login', Cognome: 'a@b.it', Email: 'x@y.it' })]);
    expect(item?.candidate).toMatchObject({ firstName: '', lastName: '' });
    expect(item?.flags).toContain('incomplete_name');
  });

  it('skips empty rows and rows without usable data', () => {
    expect(run([], [row(2, {}), row(3, { Nome: '', Email: 'not-an-email' })])).toEqual([]);
  });

  it('reads tags, linkedin and notes, and discards a LinkedIn column that holds something else', () => {
    const [item] = run([], [row(2, { Nome: 'A', Cognome: 'B', Email: 'a@b.it', LinkedIn: 'www.linkedin.com/in/ab', Tag: ' Java ,,JAVA, Go ' })]);
    expect(item?.candidate).toMatchObject({ linkedinUrl: 'https://www.linkedin.com/in/ab', tags: ['java', 'go'] });
    const [other] = run([], [row(2, { Nome: 'A', Cognome: 'B', Email: 'a@b.it', LinkedIn: 'https://evil.example/x' })]);
    expect(other?.candidate.linkedinUrl).toBeNull();
    for (const hostile of ['https://evil.example/linkedin.com/in/x', 'https://linkedin.com.evil.example/in/x', 'https://notlinkedin.com/in/x', 'https://evil.example/?u=linkedin.com', 'https://linkedin.com@evil.example/in/x', 'evil.example#linkedin.com']) {
      const [item] = run([], [row(2, { Nome: 'A', Cognome: 'B', Email: 'a@b.it', LinkedIn: hostile })]);
      expect(item?.candidate.linkedinUrl, hostile).toBeNull();
    }
    for (const fine of ['https://it.linkedin.com/in/ab', 'HTTPS://LinkedIn.com/in/ab', 'linkedin.com/in/ab']) {
      const [item] = run([], [row(2, { Nome: 'A', Cognome: 'B', Email: 'a@b.it', LinkedIn: fine })]);
      expect(item?.candidate.linkedinUrl, fine).not.toBeNull();
    }
  });

  it('works with a full name column and with no mapping at all', () => {
    const full = matchImport({ cvs: [], rows: [row(1, { 'Nome completo': 'Rossi Mario', Mail: 'r@x.it' })], mapping: autoMapColumns(['Nome completo', 'Mail']), existingByEmail: {} });
    expect(full[0]?.candidate).toMatchObject({ firstName: 'Rossi', lastName: 'Mario', email: 'r@x.it' });
    expect(matchImport({ cvs: [], rows: [row(1, { Nome: 'A' })], mapping: emptyImportMapping(), existingByEmail: {} })).toEqual([]);
  });
});

describe('matchImport existing candidates', () => {
  const existing: ImportExistingRef = { id: 'cand_1', firstName: 'Mario', lastName: 'Rossi', phone: '333 1234567', linkedinUrl: 'https://www.linkedin.com/in/mr' };

  it('marks a person already in the database and lists what differs without overwriting', () => {
    const [item] = run(
      [cv('x.pdf', { email: 'mario@x.it' })],
      [row(2, { Nome: 'Marione', Cognome: 'Rossi', Email: 'mario@x.it', Telefono: '347 0000000', LinkedIn: 'https://www.linkedin.com/in/other' })],
      { 'mario@x.it': existing },
    );
    expect(item?.existing).toEqual(existing);
    expect(item?.flags).toContain('existing_candidate');
    expect(item?.conflicts.map((c) => [c.field, c.kind, c.kept, c.other])).toEqual([
      ['name', 'existing', 'Mario Rossi', 'Marione Rossi'],
      ['phone', 'existing', '333 1234567', '347 0000000'],
      ['linkedinUrl', 'existing', 'https://www.linkedin.com/in/mr', 'https://www.linkedin.com/in/other'],
    ]);
  });

  it('has no conflicts when the data agrees, whatever the order of the name', () => {
    const [item] = run([], [row(2, { Nome: 'Rossi', Cognome: 'MARIO', Email: 'mario@x.it', Telefono: '+39 333 1234567' })], { 'mario@x.it': existing });
    expect(item?.conflicts).toEqual([]);
  });
});

describe('collectImportEmails', () => {
  it('collects lowercase emails of CVs and mapped rows once', () => {
    expect(collectImportEmails([cv('a.pdf', { email: 'A@x.it' })], [row(1, { Email: 'a@x.it' }), row(2, { Email: 'B@y.it' }), row(3, { Email: '??' })], mapping).toSorted()).toEqual(['a@x.it', 'b@y.it']);
    expect(collectImportEmails([], [row(1, { Email: 'a@x.it' })], emptyImportMapping())).toEqual([]);
  });
});

describe('matchImport on a realistic messy batch', () => {
  it('handles a folder of CVs plus a sheet with accents, swapped names, a duplicate and orphans', () => {
    const cvs = [
      cv('Rossi_Mario_CV.pdf', { name: 'Mario Rossi', email: 'mario.rossi@gmail.com' }),
      cv('CV Giuseppina Esposito.docx', { name: 'Giuseppina Esposito' }),
      cv('Zoe_Mueller.pdf', { name: 'Zoë Müller' }),
      cv('scan_0042.pdf'),
      cv('Mario Rossi (1).pdf', { name: 'Mario Rossi', email: 'MARIO.ROSSI@gmail.com' }),
    ];
    const rows = [
      row(2, { Nome: 'Mario', Cognome: 'Rossi', Email: 'mario.rossi@gmail.com', Telefono: '+39 333 1112233', Note: 'Da richiamare', Tag: 'backend' }),
      row(3, { Nome: 'Esposito', Cognome: 'Giuseppina', Email: 'g.esposito@pec.it', CV: '' }),
      row(4, { Nome: 'Zoe', Cognome: 'Muller', Email: 'zoe@x.ch', CV: 'Zoe_Mueller.pdf' }),
      row(5, { Nome: 'Carlo', Cognome: 'Bianchi', Email: 'carlo@x.it' }),
      row(6, { Nome: 'mario', Cognome: 'rossi', Email: 'MARIO.ROSSI@GMAIL.COM', Note: 'Duplicato' }),
    ];
    const items = run(cvs, rows);
    const rossi = items.find((i) => i.candidate.email === 'mario.rossi@gmail.com');
    expect(rossi).toMatchObject({ confidence: 'high', sources: { rows: [2, 6], files: ['Rossi_Mario_CV.pdf', 'Mario Rossi (1).pdf'] } });
    expect(rossi?.candidate.note).toBe('Da richiamare\n\nDuplicato');
    const giuseppina = items.find((i) => i.cv?.fileName === 'CV Giuseppina Esposito.docx');
    expect(giuseppina).toMatchObject({ basis: 'name', confidence: 'medium', candidate: { email: 'g.esposito@pec.it' } });
    expect(items.find((i) => i.cv?.fileName === 'Zoe_Mueller.pdf')).toMatchObject({ basis: 'file_name', confidence: 'high' });
    expect(items.find((i) => i.cv?.fileName === 'scan_0042.pdf')).toMatchObject({ flags: expect.arrayContaining(['no_email', 'incomplete_name']) });
    expect(items.find((i) => i.candidate.email === 'carlo@x.it')?.flags).toEqual(['no_cv']);
    expect(items).toHaveLength(5);
  });
});
