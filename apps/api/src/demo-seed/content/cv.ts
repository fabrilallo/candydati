import { cvExtractionSchema, type CvExtraction } from '@candydati/domain';
import { shuffled } from '../random.js';
import type { DemoPerson } from './people.js';
import type { CvProfile } from './types.js';

interface ProfileSpec {
  readonly headlines: readonly string[];
  readonly years: readonly [number, number];
  readonly skills: readonly string[];
  readonly summaries: readonly string[];
  readonly degree: string;
}

/** Invented employers: no real company appears in a demo CV. */
const COMPANIES = ['Studio Rinaldi Software', 'Nordest Digitale', 'Ponte Sistemi', 'Lanterna Tech', 'Officine Adriatiche', 'Vela Servizi Informatici', 'Corte Lab', 'Brenta Dati'];
const UNIVERSITIES = ['Università di Bologna', 'Politecnico di Milano', 'Università di Padova', 'Università di Torino', 'Università di Pisa', 'Università Federico II di Napoli'];
const CITIES = ['Milano', 'Bologna', 'Torino', 'Padova', 'Firenze', 'Verona', 'Bergamo', 'Roma', 'Modena', 'Trento'];
const ENGLISH = ['Inglese (B2)', 'Inglese (C1)', 'Inglese (B1)'];

const PROFILES: Readonly<Record<CvProfile, ProfileSpec>> = {
  backend: {
    headlines: ['Backend Developer', 'Senior Software Engineer', 'Node.js Developer', 'Java Developer', 'Platform Engineer'],
    years: [3, 11],
    skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'Java', 'Kotlin', 'Go', 'Docker', 'Kubernetes', 'AWS', 'Kafka', 'Redis', 'Terraform'],
    summaries: ['Ha guidato la migrazione di un monolite a servizi', 'Ha ridotto i tempi di risposta delle API del 40%', 'Ha introdotto i test di contratto tra servizi', 'Si occupa dei turni di reperibilità e del monitoraggio'],
    degree: 'Laurea in Informatica',
  },
  frontend: {
    headlines: ['Frontend Developer', 'Vue Developer', 'Web Developer'],
    years: [2, 8],
    skills: ['Vue', 'React', 'TypeScript', 'CSS', 'Vite', 'Playwright', 'Accessibilità'],
    summaries: ['Ha rifatto il flusso di checkout rispettando le WCAG', 'Cura la libreria di componenti condivisa'],
    degree: 'Laurea in Ingegneria Informatica',
  },
  design: {
    headlines: ['Product Designer', 'UX/UI Designer', 'Service Designer'],
    years: [2, 9],
    skills: ['Figma', 'Ricerca con gli utenti', 'Test di usabilità', 'Design system', 'Prototipazione', 'Maze', 'HTML e CSS'],
    summaries: ['Ha condotto oltre 30 interviste con utenti per un’app di prenotazioni', 'Ha avviato il design system aziendale', 'Ha ridisegnato l’onboarding riducendo gli abbandoni'],
    degree: 'Laurea in Design della Comunicazione',
  },
  data: {
    headlines: ['Data Engineer', 'Analytics Engineer', 'BI Developer'],
    years: [2, 9],
    skills: ['Python', 'SQL', 'dbt', 'Airflow', 'BigQuery', 'Spark', 'Dagster', 'Looker'],
    summaries: ['Ha portato le pipeline notturne da 6 ore a 40 minuti', 'Ha introdotto i test di qualità dei dati con dbt', 'Mantiene il data warehouse di un gruppo di 12 sedi'],
    degree: 'Laurea in Statistica',
  },
  customer: {
    headlines: ['Customer Success Manager', 'Account Manager', 'Customer Support Specialist'],
    years: [1, 8],
    skills: ['HubSpot', 'Intercom', 'Onboarding clienti', 'Rinnovi', 'Zendesk', 'Formazione clienti'],
    summaries: ['Segue un portafoglio di circa 100 clienti PMI', 'Ha ridotto il churn annuale dal 12% all’8%', 'Ha scritto la base di conoscenza per i clienti'],
    degree: 'Laurea in Economia',
  },
};

const pick = <T>(items: readonly T[], random: () => number): T => items[Math.floor(random() * items.length)] as T;
const between = ([min, max]: readonly [number, number], random: () => number): number => min + Math.floor(random() * (max - min + 1));

export interface DemoCv {
  readonly extraction: CvExtraction;
  /** The text of the generated PDF, one entry per line: also what full-text search indexes. */
  readonly lines: readonly string[];
}

const cvLines = (person: DemoPerson, cv: CvExtraction): readonly string[] => [
  `${person.firstName} ${person.lastName}`,
  person.email,
  `${cv.headline ?? ''} · ${cv.location ?? ''}`,
  `${cv.yearsOfExperience ?? 0} anni di esperienza`,
  '',
  'Esperienze',
  ...cv.experiences.flatMap((experience) => [`${experience.title} - ${experience.company ?? ''} (${experience.from ?? ''} - ${experience.to ?? 'oggi'})`, experience.summary ?? '']),
  '',
  'Formazione',
  ...cv.education.map((education) => `${education.title}, ${education.institution ?? ''} (${education.year ?? ''})`),
  '',
  `Competenze: ${cv.skills.join(', ')}`,
  `Lingue: ${cv.languages.join(', ')}`,
];

/**
 * A CV for an invented person, and the structured data the CV reader would have extracted from it: the precomputed
 * output of the extraction model, so the profile shows it without a model. Never a judgement about the person.
 */
export function buildCv(person: DemoPerson, profile: CvProfile, year: number, random: () => number): DemoCv {
  const spec = PROFILES[profile];
  const years = between(spec.years, random);
  const [current, previous] = shuffled(COMPANIES, random);
  const switchYear = year - Math.max(1, Math.floor(years / 2));
  const extraction = cvExtractionSchema.parse({
    headline: pick(spec.headlines, random),
    location: pick(CITIES, random),
    yearsOfExperience: years,
    experiences: [
      { title: pick(spec.headlines, random), company: current, from: String(switchYear), summary: pick(spec.summaries, random) },
      { title: pick(spec.headlines, random), company: previous, from: String(year - years), to: String(switchYear), summary: pick(spec.summaries, random) },
    ],
    education: [{ title: spec.degree, institution: pick(UNIVERSITIES, random), year: String(year - years - 1) }],
    skills: shuffled(spec.skills, random).slice(0, 5),
    languages: ['Italiano (madrelingua)', pick(ENGLISH, random)],
  });
  return { extraction, lines: cvLines(person, extraction) };
}
