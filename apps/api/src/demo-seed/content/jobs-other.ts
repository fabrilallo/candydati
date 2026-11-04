import type { DemoJobSpec } from './types.js';

/** A job recruited for the demo client (agency feature). The client is named on the ad. */
export const CLIENT_DATA_JOB: DemoJobSpec = {
  key: 'data-client',
  status: 'published',
  createdDaysAgo: 22,
  publishedDaysAgo: 20,
  content: {
    title: 'Data Engineer (m/f/x)',
    language: 'it',
    role: 'data_engineer',
    seniority: 'mid',
    contractType: 'permanent',
    salary: { min: 42000, max: 55000, currency: 'EUR', period: 'year' },
    workMode: 'hybrid',
    location: { country: 'IT', city: 'Bologna', onsiteDaysPerWeek: 1 },
    responseDays: 7,
    process: [
      { id: 'chiamata', title: 'Chiamata conoscitiva', type: 'screening_call', durationMinutes: 30, conductedBy: 'recruiter' },
      { id: 'esercizio', title: 'Esercizio a casa', type: 'take_home_assignment', durationMinutes: 180, conductedBy: 'technical_lead', note: 'Un esercizio di circa tre ore, da consegnare entro una settimana.' },
      { id: 'tecnico', title: 'Colloquio tecnico con il cliente', type: 'technical_interview', durationMinutes: 60, conductedBy: 'external_partner' },
    ],
    summary:
      'Per un nostro cliente, una rete di poliambulatori in Emilia-Romagna, cerchiamo una persona che costruisca le pipeline che portano i dati delle visite al data warehouse e ai cruscotti delle sedi.',
    responsibilities: [
      'Progettare pipeline batch e in streaming',
      'Curare qualità, lineage e documentazione dei dati',
      'Collaborare con il team clinico e amministrativo sulle metriche',
    ],
    requirements: {
      mustHave: ['Esperienza con SQL e Python', 'Esperienza con almeno un orchestratore (Airflow, Dagster o simili)'],
      niceToHave: ['dbt', 'BigQuery', 'Esperienza con dati sanitari e GDPR'],
    },
    technologies: ['Python', 'SQL', 'dbt', 'Airflow', 'BigQuery'],
    benefits: ['Buoni pasto da 7 € al giorno', 'Welfare aziendale da 1.000 € l’anno', 'Assicurazione sanitaria integrativa'],
    growth: 'Formazione certificata su Google Cloud nel primo anno, a carico dell’azienda.',
    workLifeBalance: 'Un giorno a settimana nella sede di Bologna, il resto da remoto.',
    culture: 'Un team dati di 5 persone, nato due anni fa, che lavora con medici e amministrazione.',
  },
  restrictedStages: [],
  criteria: [
    { key: 'sql', label: 'Modellazione dei dati in SQL', stageId: null },
    { key: 'pipelines', label: 'Affidabilità delle pipeline', stageId: 'esercizio' },
  ],
  automations: [{ key: 'assignment', stageId: 'esercizio', action: { type: 'send_template', templateId: 'assignment' } }],
  interviewers: [{ stageId: 'esercizio', kind: 'owner' }],
  quality: {
    scores: { role_requirements: 1, benefits: 1, growth: 1, work_life_balance: 1, responsibilities_clarity: 0.5, culture: 1, technologies: 1 },
    vaguePhrases: [
      { text: 'Collaborare con il team clinico e amministrativo sulle metriche', category: 'responsibilities_clarity', suggestion: 'Indica quali metriche e con quale ritmo: per esempio "definire ogni trimestre gli indicatori di attesa delle sedi con la direzione sanitaria".' },
    ],
    improvements: ['Specifica il volume dei dati (righe al giorno, sorgenti) per far capire la scala del lavoro.'],
  },
  client: 'named',
  profile: 'data',
  pipeline: [
    { stage: 'received', count: 2 },
    { stage: 'chiamata', count: 2 },
    { stage: 'esercizio', count: 2 },
    { stage: 'tecnico', count: 3 },
  ],
};

/** A closed job: one hire with the offer accepted and a start date, everyone else with an answer. */
export const CLOSED_CUSTOMER_JOB: DemoJobSpec = {
  key: 'customer-success',
  status: 'closed',
  createdDaysAgo: 64,
  publishedDaysAgo: 60,
  closedDaysAgo: 8,
  content: {
    title: 'Customer Success Manager (m/f/x)',
    language: 'it',
    role: 'customer_success_manager',
    seniority: 'mid',
    contractType: 'permanent',
    salary: { min: 32000, max: 40000, currency: 'EUR', period: 'year' },
    workMode: 'onsite',
    location: { country: 'IT', city: 'Bologna', onsiteDaysPerWeek: 5 },
    responseDays: 5,
    process: [
      { id: 'conoscitivo', title: 'Colloquio conoscitivo', type: 'hr_interview', durationMinutes: 45, conductedBy: 'recruiter' },
      { id: 'responsabile', title: 'Colloquio con la responsabile', type: 'manager_interview', durationMinutes: 60, conductedBy: 'hiring_manager' },
    ],
    summary: 'Accompagnerai gli studi medici dai primi giorni sulla piattaforma fino al rinnovo, con un portafoglio di circa 120 clienti.',
    responsibilities: ['Guidare l’avvio dei nuovi clienti', 'Raccogliere richieste e portarle al team prodotto', 'Seguire i rinnovi annuali'],
    requirements: { mustHave: ['Almeno 2 anni in customer success o account management', 'Ottimo italiano scritto e parlato'], niceToHave: ['Esperienza con software gestionali'] },
    technologies: ['HubSpot', 'Intercom'],
    benefits: ['Buoni pasto da 8 € al giorno', 'Assicurazione sanitaria integrativa'],
    growth: 'Dopo un anno, la possibilità di seguire i clienti più grandi o di passare al team prodotto.',
    workLifeBalance: 'Dal lunedì al venerdì, 9-18 con un’ora di pausa. Nessuna reperibilità.',
    culture: 'Un team di 6 persone che si confronta ogni mattina per 15 minuti.',
  },
  restrictedStages: [],
  criteria: [{ key: 'listening', label: 'Ascolto delle richieste del cliente', stageId: null }],
  automations: [],
  interviewers: [{ stageId: 'responsabile', kind: 'owner' }],
  quality: {
    scores: { role_requirements: 1, benefits: 0.5, growth: 1, work_life_balance: 1, responsibilities_clarity: 1, culture: 1, technologies: 1 },
    vaguePhrases: [],
    improvements: ['Aggiungi un benefit legato alla formazione o al welfare, se previsto.'],
  },
  client: null,
  profile: 'customer',
  pipeline: [
    { stage: 'responsabile', count: 1, outcome: 'hired' },
    { stage: 'responsabile', count: 1, outcome: 'not_selected' },
    { stage: 'conoscitivo', count: 3, outcome: 'not_selected' },
    { stage: 'received', count: 2, outcome: 'not_selected' },
    { stage: 'conoscitivo', count: 1, outcome: 'withdrawn' },
  ],
  hire: { offerAcceptedDaysAgo: 10, startsInDays: 20 },
};
