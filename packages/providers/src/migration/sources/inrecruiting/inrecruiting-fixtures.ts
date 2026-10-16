import { makePdf, makeXlsx, makeZip } from '../../../testing/fixtures.js';

/**
 * ASSUMED: InRecruiting publishes no export format. This is a synthetic spreadsheet with the headers an export is
 * guessed to use (Italian, semicolon-separated like an Excel export in Italy). Every person and address is invented.
 */
export const ASSUMED_HEADERS = ['Nome', 'Cognome', 'Email', 'Telefono', 'Annuncio', 'Codice annuncio', 'Fase', 'Data candidatura', 'Esito', 'Note', 'Tag', 'Fonte', 'CV', 'Valutazione', 'Taglia scarpe'] as const;

export const ASSUMED_ROWS: readonly (readonly string[])[] = [
  ['Mario', 'Rossi', 'Mario.Rossi@example.com', '+39 333 1234567', 'Backend Developer', 'BE-01', 'Colloquio HR', '14/03/2025', '', 'Buon profilo', 'node; senior', 'LinkedIn', 'Mario_Rossi_CV.pdf', '4/5', '42'],
  ['Anna', 'Bianchi', 'anna.bianchi@example.com', '', 'Backend Developer', 'BE-01', 'Assunto', '02/04/2025', '', '', '', 'Sito', '', '5', '38'],
  ['Luca', 'Verdi', 'luca.verdi@example.com', '', 'Backend Developer', 'BE-01', 'Colloquio HR', '20/03/2025', 'Scartato', 'Non allineato', 'Node', '', '', '2', ''],
  ['Mario', 'Rossi', 'mario.rossi@example.com', '', 'Designer', '', 'Candidatura', '01/05/2025', 'Ritirato', '', '', '', '', '', ''],
  ['Giulia', 'Neri', '', '329.1234567', 'Designer', '', 'Colloquio tecnico', '2025-05-10', '', '', '', 'Referral', '', '', ''],
  ['Paolo', 'Gialli', 'paolo.gialli@example.com', 'non lo so', 'Designer', '', 'Colloquio HR', '31/02/2025', '', '', '', '', '', '', ''],
  ['Elena', 'Blu', 'non-una-email', '', 'Designer', '', 'Colloquio HR', '', '', '', '', '', '', '', ''],
  ['Senza', 'Annuncio', 'x@example.com', '', '', '', 'Colloquio HR', '', '', '', '', '', '', '', ''],
  ['Luca', 'Verdi', 'luca.verdi@example.com', '', 'Backend Developer', 'BE-01', 'Colloquio tecnico', '25/03/2025', '', '', '', '', '', '', ''],
];

const cellOf = (value: string): string => (/[;"\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);

export const csvOf = (headers: readonly string[], rows: readonly (readonly string[])[]): Uint8Array =>
  new TextEncoder().encode([headers, ...rows].map((row) => row.map(cellOf).join(';')).join('\n'));

export const assumedCsv = (): Uint8Array => csvOf(ASSUMED_HEADERS, ASSUMED_ROWS);
export const assumedXlsx = (): Promise<Uint8Array> => makeXlsx([[...ASSUMED_HEADERS], ...ASSUMED_ROWS.map((row) => [...row])], 'Candidature');

/** CVs: one named by the sheet, one by full name, one by email, and one nobody asked for. */
export const assumedCvZip = (): Uint8Array =>
  makeZip([
    { name: 'cv/Mario_Rossi_CV.pdf', content: makePdf(['Mario Rossi', 'Sviluppatore backend']) },
    { name: 'cv/Giulia Neri.pdf', content: makePdf(['Giulia Neri', 'Product designer']) },
    { name: 'cv/cv_paolo.gialli@example.com.pdf', content: makePdf(['Paolo Gialli']) },
    { name: 'cv/Sconosciuto Qualunque.pdf', content: makePdf(['Qualcun altro']) },
    { name: 'note.txt', content: 'non un CV' },
  ]);
