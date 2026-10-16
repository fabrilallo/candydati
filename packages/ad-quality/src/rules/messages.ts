import type { Locale, QualityCategory } from '@candydati/domain';
import type { Issue } from './result.js';

type Lines = Readonly<Partial<Record<Issue, string>>> & { readonly missing: string; readonly partial: string };

/** One actionable line per category and issue, in the language of the ad. */
export const IMPROVEMENT_MESSAGES: Record<Locale, Record<QualityCategory, Lines>> = {
  it: {
    selection_process: {
      missing: 'Descrivi il processo di selezione: fasi, durata di ciascuna, chi le conduce.',
      partial: 'Indica entro quanti giorni il candidato riceve una risposta dopo ogni fase.',
    },
    role_requirements: {
      missing: 'Aggiungi i requisiti del ruolo, separando quelli indispensabili da quelli utili.',
      partial: 'Elenca almeno tre requisiti verificabili (strumenti, livelli, anni di esperienza).',
      vague: 'Sostituisci i requisiti generici con fatti verificabili: strumento, livello o anni di esperienza.',
    },
    work_mode: {
      missing: 'Indica la modalità di lavoro: remoto, ibrido o in sede.',
      partial: 'Completa la modalità di lavoro con paese, città e giorni a settimana in sede.',
    },
    salary_transparency: {
      missing: 'Indica il range di retribuzione lorda (minimo e massimo).',
      partial: 'Completa il range di retribuzione indicando sia il minimo sia il massimo.',
      wide: 'Il range di retribuzione è molto ampio (il massimo supera il doppio del minimo): restringilo o spiega da cosa dipende.',
      invalid: 'Il massimo della retribuzione è inferiore al minimo: correggi il range.',
    },
    benefits: {
      missing: 'Elenca i benefit offerti.',
      partial: 'Elenca almeno tre benefit e quantificane qualcuno (importi, giorni, coperture).',
      vague: 'Sostituisci i benefit generici con voci concrete e il loro valore.',
    },
    growth: {
      missing: 'Descrivi le opportunità di crescita e formazione.',
      partial: 'Indica il budget annuo per la formazione e come si usa, o i passaggi di carriera.',
      vague: 'Sostituisci le formule generiche sulla crescita con budget, percorsi o tempi concreti.',
    },
    work_life_balance: {
      missing: 'Descrivi le politiche di equilibrio vita-lavoro.',
      partial: 'Indica fasce orarie, giorni di ferie o di smart working.',
      vague: 'Sostituisci le formule generiche sulla flessibilità con orari, giorni o regole concrete.',
    },
    responsibilities_clarity: {
      missing: 'Elenca le responsabilità del ruolo.',
      partial: 'Aggiungi obiettivi o indicatori misurabili alle responsabilità (almeno tre voci).',
      vague: 'Rendi le responsabilità specifiche: cosa si fa, per chi, con quale risultato atteso.',
    },
    culture: {
      missing: 'Descrivi la cultura del team con pratiche concrete.',
      partial: 'Aggiungi una pratica concreta del team (feedback, retrospettive, code review).',
      vague: 'Sostituisci gli slogan sull\'ambiente con pratiche concrete del team.',
    },
    technologies: {
      missing: 'Elenca le tecnologie e gli strumenti usati.',
      partial: 'Elenca almeno tre tecnologie o strumenti effettivamente usati.',
      vague: 'Sostituisci i riferimenti generici con linguaggi, strumenti e versioni effettivi.',
    },
  },
  en: {
    selection_process: {
      missing: 'Describe the selection process: stages, how long each takes, who runs it.',
      partial: 'State within how many days candidates hear back after each stage.',
    },
    role_requirements: {
      missing: 'Add the role requirements, separating must-haves from nice-to-haves.',
      partial: 'List at least three verifiable requirements (tools, levels, years of experience).',
      vague: 'Replace generic requirements with verifiable facts: a tool, a level or years of experience.',
    },
    work_mode: {
      missing: 'State the work mode: remote, hybrid or onsite.',
      partial: 'Complete the work mode with country, city and days per week onsite.',
    },
    salary_transparency: {
      missing: 'State the gross salary range (minimum and maximum).',
      partial: 'Complete the salary range with both the minimum and the maximum.',
      wide: 'The salary range is very wide (the maximum is over twice the minimum): narrow it or explain what it depends on.',
      invalid: 'The maximum salary is below the minimum: fix the range.',
    },
    benefits: {
      missing: 'List the benefits offered.',
      partial: 'List at least three benefits and quantify some of them (amounts, days, coverage).',
      vague: 'Replace generic benefits with concrete items and their value.',
    },
    growth: {
      missing: 'Describe the growth and training opportunities.',
      partial: 'State the yearly training budget and how it is used, or the career steps.',
      vague: 'Replace generic growth wording with concrete budgets, paths or timelines.',
    },
    work_life_balance: {
      missing: 'Describe the work-life balance policies.',
      partial: 'State working hours windows, days of leave or remote days.',
      vague: 'Replace generic flexibility wording with concrete hours, days or rules.',
    },
    responsibilities_clarity: {
      missing: 'List the responsibilities of the role.',
      partial: 'Add measurable goals or indicators to the responsibilities (at least three items).',
      vague: 'Make responsibilities specific: what is done, for whom, with what expected result.',
    },
    culture: {
      missing: 'Describe the team culture with concrete practices.',
      partial: 'Add a concrete team practice (feedback, retrospectives, code review).',
      vague: 'Replace environment slogans with concrete team practices.',
    },
    technologies: {
      missing: 'List the technologies and tools in use.',
      partial: 'List at least three technologies or tools actually used.',
      vague: 'Replace generic references with the actual languages, tools and versions.',
    },
  },
};
