import { normalizeText, type Outcome } from '@candydati/domain';

// Phrases are tested on text without accents or punctuation, most specific first: "non assunto" is a rejection, not a hire.
const WITHDRAWN = /\b(ritirat[oaie]|ritiro|withdrawn|withdrew|rinunciat[oaie]|rinuncia|offerta rifiutata|offer declined|declined by candidate|rifiutato dal candidato)\b/;
const NOT_SELECTED = /\b(non (assunt[oaie]|idone[oa]|idonei|selezionat[oaie]|ammess[oaie])|scartat[oaie]|rifiutat[oaie]|respint[oaie]|rejected|not selected|not hired|disqualified)\b/;
const HIRED = /\b(assunt[oaie]|assunzione|hired|offer accepted|offerta accettata)\b/;

/** The outcome a status or outcome word stands for, or null when it is just a stage (or something unknown). */
export function outcomeOf(value: string): Outcome | null {
  const text = normalizeText(value);
  if (text === '') return null;
  if (WITHDRAWN.test(text)) return 'withdrawn';
  if (NOT_SELECTED.test(text)) return 'not_selected';
  if (HIRED.test(text)) return 'hired';
  return null;
}
