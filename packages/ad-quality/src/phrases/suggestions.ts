import type { Locale } from '@candydati/domain';
import type { QualityCategory } from '@candydati/domain';

/** Default rewrite hint per category: it asks for the missing fact instead of inventing one. */
export const DEFAULT_SUGGESTIONS: Record<Locale, Record<QualityCategory, string>> = {
  it: {
    selection_process: 'Indica quante fasi ci sono, quanto durano, chi le conduce e in quanti giorni si riceve una risposta.',
    role_requirements: 'Sostituisci con un requisito verificabile: strumento, livello (es. B2 per l\'inglese) o anni di esperienza richiesti.',
    work_mode: 'Indica la modalità (remoto, ibrido, in sede), la città e quanti giorni a settimana in ufficio.',
    salary_transparency: 'Indica il range di retribuzione lorda annua (minimo e massimo).',
    benefits: 'Elenca ogni benefit con il suo valore (es. importo dei buoni pasto, copertura della polizza sanitaria).',
    growth: 'Indica il budget annuo per la formazione e come si usa, o i passaggi di carriera e ogni quanto si valutano.',
    work_life_balance: 'Indica la fascia oraria, i giorni di ferie e di smart working, e se è prevista reperibilità.',
    responsibilities_clarity: 'Descrivi cosa farà la persona nei primi mesi e come si misura il risultato (obiettivi, KPI).',
    culture: 'Descrivi una pratica concreta del team (es. cadenza dei feedback, retrospettive, code review).',
    technologies: 'Elenca linguaggi, strumenti e versioni effettivamente usati.',
  },
  en: {
    selection_process: 'State how many stages there are, how long each takes, who runs it and how many days until a reply.',
    role_requirements: 'Replace with a verifiable requirement: a tool, a level (e.g. B2 English) or the years of experience needed.',
    work_mode: 'State the mode (remote, hybrid, onsite), the city and how many days a week in the office.',
    salary_transparency: 'State the gross annual salary range (minimum and maximum).',
    benefits: 'List each benefit with its value (e.g. meal voucher amount, health cover limits).',
    growth: 'State the yearly training budget and how it is used, or the career steps and how often they are reviewed.',
    work_life_balance: 'State the working hours window, the days of leave and remote work, and whether on-call is expected.',
    responsibilities_clarity: 'Describe what the person will do in the first months and how success is measured (goals, KPIs).',
    culture: 'Describe a concrete team practice (e.g. feedback cadence, retrospectives, code review).',
    technologies: 'List the languages, tools and versions actually in use.',
  },
};
