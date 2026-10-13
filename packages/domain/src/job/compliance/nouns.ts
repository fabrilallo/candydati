/**
 * Italian job nouns that have a masculine and a feminine form. Gender-neutral nouns (analista, consulente,
 * responsabile, specialista, manager, designer, developer, assistente, docente, insegnante, giornalista, farmacista,
 * dentista, progettista, ...) are deliberately NOT here: they never trigger.
 * Flags: `a` = also an adjective (tecnico, grafico): counted only when it opens the title; `x` = the feminine form
 * is also a common word (commessa = order, tecnica = technique): the feminine is never flagged.
 */
type Entry = readonly [masculine: string, feminine: string, flags?: 'a' | 'x' | 'ax'];

export const JOB_NOUNS: readonly Entry[] = [
  ['sviluppatore', 'sviluppatrice'],
  ['programmatore', 'programmatrice'],
  ['impiegato', 'impiegata'],
  ['operaio', 'operaia'],
  ['commesso', 'commessa', 'x'],
  ['magazziniere', 'magazziniera'],
  ['venditore', 'venditrice'],
  ['ingegnere', 'ingegnera'],
  ['direttore', 'direttrice'],
  ['tecnico', 'tecnica', 'ax'],
  ['addetto', 'addetta'],
  ['segretario', 'segretaria'],
  ['cameriere', 'cameriera'],
  ['cuoco', 'cuoca'],
  ['infermiere', 'infermiera'],
  ['idraulico', 'idraulica', 'ax'],
  ['meccanico', 'meccanica', 'ax'],
  ['saldatore', 'saldatrice'],
  ['carpentiere', 'carpentiera'],
  ['ragioniere', 'ragioniera'],
  ['avvocato', 'avvocata'],
  ['architetto', 'architetta'],
  ['perito', 'perita'],
  ['medico', 'medica', 'ax'],
  ['chirurgo', 'chirurga'],
  ['veterinario', 'veterinaria', 'a'],
  ['educatore', 'educatrice'],
  ['istruttore', 'istruttrice'],
  ['formatore', 'formatrice'],
  ['collaboratore', 'collaboratrice'],
  ['coordinatore', 'coordinatrice'],
  ['supervisore', 'supervisora'],
  ['amministratore', 'amministratrice'],
  ['portiere', 'portiera'],
  ['fattorino', 'fattorina'],
  ['operatore', 'operatrice'],
  ['installatore', 'installatrice'],
  ['manutentore', 'manutentrice'],
  ['collaudatore', 'collaudatrice'],
  ['verniciatore', 'verniciatrice'],
  ['panettiere', 'panettiera'],
  ['pasticcere', 'pasticcera'],
  ['pizzaiolo', 'pizzaiola'],
  ['macellaio', 'macellaia'],
  ['gelataio', 'gelataia'],
  ['parrucchiere', 'parrucchiera'],
  ['promotore', 'promotrice'],
  ['procacciatore', 'procacciatrice'],
  ['cassiere', 'cassiera'],
  ['bagnino', 'bagnina'],
  ['animatore', 'animatrice'],
  ['accompagnatore', 'accompagnatrice'],
  ['traduttore', 'traduttrice'],
  ['redattore', 'redattrice'],
  ['grafico', 'grafica', 'ax'],
  ['fotografo', 'fotografa'],
  ['disegnatore', 'disegnatrice'],
  ['topografo', 'topografa'],
  ['ricercatore', 'ricercatrice'],
  ['professore', 'professoressa'],
  ['maestro', 'maestra'],
  ['psicologo', 'psicologa'],
  ['dottore', 'dottoressa'],
  ['vicedirettore', 'vicedirettrice'],
  ['esperto', 'esperta', 'a'],
  ['lavoratore', 'lavoratrice'],
  ['stalliere', 'stalliera'],
  ['barbiere', 'barbiera'],
];

const PLURAL_OVERRIDES: Readonly<Record<string, string>> = { cuoco: 'cuochi', chirurgo: 'chirurghi' };

export const pluralMasculine = (word: string): string => {
  const override = PLURAL_OVERRIDES[word];
  if (override !== undefined) return override;
  if (word.endsWith('ico')) return `${word.slice(0, -3)}ici`;
  return word.endsWith('io') ? word.slice(0, -1) : `${word.slice(0, -1)}i`;
};

export const pluralFeminine = (word: string): string => {
  if (word.endsWith('trice') || word.endsWith('ice')) return `${word.slice(0, -2)}ci`;
  return `${word.slice(0, -1)}e`;
};

export interface NounMatch {
  readonly entry: { readonly masculine: string; readonly feminine: string; readonly adjectival: boolean };
  readonly gender: 'm' | 'f';
  readonly plural: boolean;
}

const index = new Map<string, NounMatch>();
const register = (word: string, match: NounMatch): void => {
  if (!index.has(word)) index.set(word, match);
};
for (const [masculine, feminine, flags = ''] of JOB_NOUNS) {
  const entry = { masculine, feminine, adjectival: flags.includes('a') };
  register(masculine, { entry, gender: 'm', plural: false });
  register(pluralMasculine(masculine), { entry, gender: 'm', plural: true });
  if (!flags.includes('x')) {
    register(feminine, { entry, gender: 'f', plural: false });
    register(pluralFeminine(feminine), { entry, gender: 'f', plural: true });
  }
}

/** Looks up a folded (lower-case, no accents) word. */
export const lookupNoun = (word: string): NounMatch | undefined => index.get(word);

/** Is `word` a masculine-only job noun (singular or plural)? */
export const isMasculineNoun = (word: string): boolean => lookupNoun(word)?.gender === 'm';
