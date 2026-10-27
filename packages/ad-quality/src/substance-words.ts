import type { Locale } from '@candydati/domain';

/** Words that carry no information on their own, per language. Folded (lowercase, no accents). */
export const STOP_WORDS: Record<Locale, ReadonlySet<string>> = {
  it: new Set([
    'il', 'lo', 'la', 'i', 'gli', 'le', 'l', 'un', 'uno', 'una', 'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra',
    'e', 'ed', 'o', 'od', 'ma', 'che', 'chi', 'non', 'si', 'ci', 'ne', 'del', 'dello', 'della', 'dei', 'degli', 'delle',
    'al', 'allo', 'alla', 'ai', 'agli', 'alle', 'dal', 'dalla', 'dai', 'dalle', 'nel', 'nella', 'nei', 'nelle', 'sul',
    'sulla', 'sui', 'sulle', 'come', 'anche', 'molto', 'poco', 'tutto', 'tutti', 'ogni', 'questo', 'questa', 'quello',
    'quella', 'sono', 'essere', 'ha', 'hanno', 'cose', 'cosa', 'roba', 'varie', 'vari', 'vario', 'varia', 'altro',
    'altri', 'altre', 'ecc', 'eccetera', 'tanto', 'tante', 'tanti', 'niente', 'nulla', 'qualcosa',
  ]),
  en: new Set([
    'the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'and', 'or', 'but', 'is', 'are', 'be', 'this', 'that',
    'it', 'as', 'by', 'from', 'not', 'we', 'you', 'our', 'your', 'etc', 'stuff', 'things', 'thing', 'whatever',
    'various', 'other', 'others', 'misc', 'some', 'something', 'nothing', 'lots', 'very',
  ]),
};

/** Placeholders, fillers and dummy names: never information, whatever surrounds them. */
export const PLACEHOLDER_WORDS: ReadonlySet<string> = new Set([
  'asd', 'asdf', 'bla', 'blah', 'blabla', 'xxx', 'xx', 'yyy', 'zzz', 'xyz', 'abc', 'abcd', 'todo', 'tbd', 'tbc', 'tba',
  'foo', 'baz', 'qux', 'qwerty', 'boh', 'mah', 'bah', 'mumble', 'pippo', 'pluto', 'paperino', 'topolino', 'tizio',
  'caio', 'sempronio', 'cacca', 'cacata', 'cacate', 'cagata', 'cagate', 'cazzata', 'cazzate', 'stronzata',
  'stronzate', 'minchiata', 'minchiate', 'puttanata', 'puttanate',
]);

/** Words that mark the whole text as dummy content (lorem ipsum). */
export const DUMMY_TEXT_WORDS: ReadonlySet<string> = new Set(['lorem', 'ipsum']);

/** Words that are filler only when they are the whole text ("test", "prova 2"): inside a sentence they are real words. */
export const WHOLE_TEXT_FILLERS: ReadonlySet<string> = new Set([
  'test', 'testo', 'text', 'prova', 'esempio', 'example', 'sample', 'placeholder', 'ciao', 'hello', 'hi', 'ok', 'okay',
  'si', 'no', 'yes', 'nd', 'na', 'n a', 'n d', 'vuoto', 'empty', 'niente', 'nothing', 'nulla', 'none',
]);

/** Four keys in a row on a QWERTY keyboard: the trace of hands mashing the keyboard. */
export const KEYBOARD_RUNS: readonly string[] = [
  'asdf', 'sdfg', 'dfgh', 'fghj', 'ghjk', 'hjkl', 'zxcv', 'xcvb', 'cvbn', 'vbnm', 'qwer', 'uiop',
];
