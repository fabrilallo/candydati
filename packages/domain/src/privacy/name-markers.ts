/**
 * Words that mark the next words as a person's name, in the five corpus languages. Only words that are always
 * followed by a person: a title, or a phrase naming a relation at work. "Sr." is left out (it also means "Senior").
 */
const IT_TITLES = ['Dott\\.?ssa', 'Dottoressa', 'Dottor', '[Dd]ott', '[Ii]ng', '[Aa]vv', '[Pp]rof\\.?ssa', '[Pp]rof', 'Sig\\.?ra', 'Sig'];
const EN_TITLES = ['Dr', 'Mrs', 'Mr', 'Ms'];
const FR_TITLES = ['Mme', 'Mlle', 'Madame', 'Monsieur', 'Mademoiselle'];
const DE_TITLES = ['Herrn', 'Herr', 'Frau', 'Mag'];
const ES_TITLES = ['Dña', 'Doña', 'Dra', 'Sra', 'Srta', 'Lic', 'Licda'];

/** Longest first, so "Dott.ssa" wins over "Dott". */
export const TITLES = [...IT_TITLES, ...EN_TITLES, ...FR_TITLES, ...DE_TITLES, ...ES_TITLES]
  .sort((a, b) => b.length - a.length)
  .join('|');

/** "M." is also an initial and "M. Sc" a degree: only before a first name and a surname. */
export const TITLES_BEFORE_FULL_NAME = 'M';

const PHRASES = [
  // Italian
  'riportavo a', 'riporto a', 'riportando a', 'sotto la guida di', 'sotto la supervisione di', 'il mio responsabile',
  'la mia responsabile', 'il mio capo', 'la mia capa', 'il mio tutor', 'la mia tutor', 'il mio collega', 'la mia collega',
  // English
  'reporting directly to', 'reporting to', 'reported to', 'report to', 'reports to', 'worked under', 'managed by', 'mentored by',
  'supervised by', 'my manager', 'my line manager', 'my colleague', 'my supervisor', 'my mentor',
  // French
  'sous la direction de', 'sous la responsabilité de', 'encadré par', 'encadrée par', 'mon collègue', 'ma collègue',
  'mon manager', 'ma manager', 'mon responsable', 'ma responsable', 'mon tuteur', 'ma tutrice',
  // German
  'unter der Leitung von', 'betreut von', 'betreut durch', 'mein Kollege', 'meine Kollegin', 'meinem Kollegen', 'meiner Kollegin',
  'mein Vorgesetzter', 'meine Vorgesetzte', 'meinem Vorgesetzten', 'meiner Vorgesetzten', 'mein Chef', 'meine Chefin',
  'mein Betreuer', 'meine Betreuerin',
  // Spanish
  'bajo la supervisión de', 'bajo la dirección de', 'reporto directamente a', 'reportaba directamente a', 'reporto a',
  'reportaba a', 'mi jefe', 'mi jefa', 'mi compañero', 'mi compañera', 'mi mentor', 'mi mentora', 'mi responsable',
];

/** The first letter in either case ("My manager", "my manager"), spaces as 1-3 blanks; longest first. */
export const RELATION_PHRASES = [...PHRASES]
  .sort((a, b) => b.length - a.length)
  .map((phrase) => `[${phrase[0]?.toUpperCase()}${phrase[0]}]${phrase.slice(1).replace(/ /g, '[ \\t]{1,3}')}`)
  .join('|');
