import type { Locale } from '../../platform/config.js';

/** Why each kind of finding is a problem and what to write instead, in the language of the ad. */
export const SUGGESTIONS = {
  gender: {
    it: 'Non indicare il sesso: rivolgiti a tutte le persone (es. "Addetto/a reception (m/f)") e descrivi solo le mansioni.',
    en: 'Do not state a gender: address everyone and describe only the duties.',
  },
  age: {
    it: "Togli ogni limite o fascia d'età. Descrivi l'esperienza che serve (es. \"3 anni con Node.js\") e non gli anni di vita.",
    en: 'Remove every age limit or range. Describe the experience needed, not the age.',
  },
  nationality: {
    it: 'Non chiedere cittadinanza, nazionalità o origine. Se serve il permesso di lavoro, scrivi "autorizzazione a lavorare in Italia".',
    en: 'Do not ask for citizenship, nationality or origin. If a work permit matters, write "right to work in Italy".',
  },
  appearance: {
    it: "Togli ogni riferimento all'aspetto fisico. Descrivi il comportamento richiesto dal ruolo (es. \"cura nel rapporto con i clienti\").",
    en: 'Remove every reference to physical appearance. Describe the behaviour the role needs (e.g. "care with customers").',
  },
  family: {
    it: 'Togli ogni riferimento a stato civile, figli o gravidanza. Indica solo orari e disponibilità richiesti dal ruolo.',
    en: 'Remove every reference to marital status, children or pregnancy. State only the hours and availability the role needs.',
  },
  photo: {
    it: 'Non chiedere la foto: il CV si valuta senza.',
    en: 'Do not ask for a photo: the CV is assessed without one.',
  },
  beliefs: {
    it: 'Togli ogni riferimento a religione, opinioni politiche o sindacali: non c\'entrano con il lavoro.',
    en: 'Remove every reference to religion, political or union views: they are unrelated to the job.',
  },
  health: {
    it: 'Non chiedere requisiti di salute generici. Se il ruolo richiede un\'idoneità specifica, indicala come tale (es. "idoneità alla mansione").',
    en: 'Do not ask for generic health requirements. If the role needs a specific fitness, name it (e.g. "fitness for the duties").',
  },
  young: {
    it: '"Giovane" è un requisito di età. Descrivi competenze e attitudini (es. "voglia di imparare") e non l\'età.',
    en: '"Young" is an age requirement. Describe skills and attitude instead.',
  },
  recent_graduate: {
    it: 'Può escludere chi ha più anni. Scrivi il titolo di studio richiesto (es. "laurea in informatica") senza riferimenti al momento della laurea.',
    en: 'It can exclude older candidates. State the degree required, with no reference to when it was earned.',
  },
  military: {
    it: 'Il servizio militare non è un requisito lecito. Toglilo.',
    en: 'Military service is not a lawful requirement. Remove it.',
  },
  native_speaker: {
    it: 'Indica il livello richiesto (es. "italiano C2") invece di "madrelingua": può escludere per nazionalità.',
    en: 'State the level required (e.g. "Italian C2") instead of "native speaker": it can exclude by nationality.',
  },
  masculine_phrasing: {
    it: 'Usa forme inclusive o neutre (es. "il/la candidato/a", "la persona selezionata").',
    en: 'Use inclusive or neutral wording.',
  },
  protected_categories: {
    it: 'Scrivi: "Iscritti alle liste del collocamento mirato ai sensi della L. 68/99".',
    en: 'Write: "People registered in the targeted placement lists under Law 68/99".',
  },
} as const;

export type SuggestionKind = keyof typeof SUGGESTIONS;

export const suggestionFor = (kind: SuggestionKind, locale: Locale): string => SUGGESTIONS[kind][locale];
