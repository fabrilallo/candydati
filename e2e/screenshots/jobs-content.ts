/** Job ads of the README organization: realistic Italian content, every field the publication rules ask for. */

type Stage = readonly [type: string, minutes: number, by: string, title?: string];

const process = (stages: readonly Stage[]) =>
  stages.map(([type, durationMinutes, conductedBy, title]) => ({ type, durationMinutes, conductedBy, ...(title ? { title } : {}) }));

const hybridMilano = { workMode: 'hybrid', location: { country: 'IT', city: 'Milano', onsiteDaysPerWeek: 2 } } as const;

export const BACKEND_JOB = {
  title: 'Backend Developer (m/f/x)',
  language: 'it',
  role: 'backend_developer',
  seniority: 'senior',
  contractType: 'permanent',
  salary: { min: 48000, max: 62000, currency: 'EUR', period: 'year' },
  ...hybridMilano,
  responseDays: 5,
  process: process([
    ['screening_call', 30, 'recruiter', 'Chiamata conoscitiva'],
    ['technical_interview', 90, 'technical_lead', 'Colloquio tecnico'],
    ['team_interview', 60, 'team_member', 'Incontro con il team'],
    ['final_interview', 45, 'hiring_manager', 'Colloquio finale'],
  ]),
  summary:
    'Cerchiamo una persona che progetti e faccia crescere i servizi che reggono la nostra piattaforma di prenotazioni per studi medici: ' +
    'API usate ogni giorno da oltre 3.000 strutture in Italia.',
  responsibilities: [
    'Progettare e mantenere API REST in TypeScript e Node.js',
    'Modellare i dati su PostgreSQL e curarne le prestazioni',
    'Rivedere il codice delle colleghe e dei colleghi e farsi rivedere il proprio',
    'Partecipare ai turni di reperibilità, una settimana ogni sei, retribuiti',
  ],
  requirements: {
    mustHave: ['Almeno 4 anni di sviluppo backend in produzione', 'Buona conoscenza di TypeScript o di un linguaggio tipizzato', 'Esperienza con database relazionali'],
    niceToHave: ['Esperienza con code di messaggi o job in background', 'Familiarità con OpenTelemetry'],
  },
  technologies: ['TypeScript', 'Node.js', 'Fastify', 'PostgreSQL', 'Docker', 'AWS'],
  benefits: ['Buoni pasto da 8 €', '1.500 € l’anno per la formazione', 'Assicurazione sanitaria integrativa', 'Orario flessibile'],
  growth: 'Un percorso di crescita scritto, con revisione ogni sei mesi e una persona di riferimento fin dal primo giorno.',
  workLifeBalance: 'Due giorni a settimana in ufficio a Milano, il resto da dove preferisci. Niente riunioni il venerdì pomeriggio.',
  culture: 'Team di 14 persone, decisioni scritte, rilasci piccoli e frequenti.',
} as const;

const DESIGNER_JOB = {
  title: 'Product Designer (m/f/x)',
  language: 'it',
  role: 'product_designer',
  seniority: 'mid',
  contractType: 'permanent',
  salary: { min: 38000, max: 48000, currency: 'EUR', period: 'year' },
  ...hybridMilano,
  responseDays: 7,
  process: process([
    ['screening_call', 30, 'recruiter', 'Chiamata conoscitiva'],
    ['case_study', 90, 'hiring_manager', 'Revisione del portfolio'],
    ['team_interview', 60, 'team_member', 'Incontro con il team'],
  ]),
  summary: 'Disegnerai l’esperienza di chi prenota una visita e di chi gestisce lo studio, dalla ricerca con gli utenti ai componenti del design system.',
  responsibilities: [
    'Condurre interviste e test di usabilità con pazienti e segreterie',
    'Progettare flussi e interfacce in Figma, dal prototipo alla consegna',
    'Far crescere il design system insieme al team frontend',
  ],
  requirements: {
    mustHave: ['Almeno 3 anni di product design su prodotti digitali', 'Un portfolio con casi reali e il processo che li ha portati lì'],
    niceToHave: ['Esperienza in ambito sanitario', 'Conoscenza di base di HTML e CSS'],
  },
  technologies: ['Figma', 'Maze', 'Notion'],
  benefits: ['Buoni pasto da 8 €', '1.500 € l’anno per la formazione', 'Assicurazione sanitaria integrativa'],
  growth: '',
  workLifeBalance: '',
  culture: '',
} as const;

const DATA_JOB = {
  title: 'Data Engineer (m/f/x)',
  language: 'it',
  role: 'data_engineer',
  seniority: 'mid',
  contractType: 'permanent',
  salary: { min: 42000, max: 55000, currency: 'EUR', period: 'year' },
  workMode: 'remote',
  location: { country: 'IT' },
  responseDays: 7,
  process: process([
    ['screening_call', 30, 'recruiter', 'Chiamata conoscitiva'],
    ['take_home_assignment', 180, 'technical_lead', 'Esercizio a casa'],
    ['technical_interview', 60, 'technical_lead', 'Colloquio tecnico'],
  ]),
  summary: 'Costruirai le pipeline che portano i dati delle prenotazioni al nostro data warehouse e alle dashboard degli studi.',
  responsibilities: ['Progettare pipeline batch e in streaming', 'Curare qualità e documentazione dei dati', 'Collaborare con il team prodotto sulle metriche'],
  requirements: { mustHave: ['Esperienza con SQL e Python', 'Esperienza con almeno un orchestratore (Airflow, Dagster o simili)'], niceToHave: ['dbt', 'BigQuery'] },
  technologies: ['Python', 'SQL', 'dbt', 'Airflow', 'BigQuery'],
  benefits: ['1.500 € l’anno per la formazione', 'Assicurazione sanitaria integrativa', 'Contributo per l’ufficio a casa'],
  growth: '',
  workLifeBalance: '',
  culture: '',
} as const;

const SUPPORT_JOB = {
  title: 'Customer Success Manager (m/f/x)',
  language: 'it',
  role: 'customer_success_manager',
  seniority: 'mid',
  contractType: 'permanent',
  salary: { min: 32000, max: 40000, currency: 'EUR', period: 'year' },
  workMode: 'onsite',
  location: { country: 'IT', city: 'Bologna', onsiteDaysPerWeek: 5 },
  responseDays: 5,
  process: process([
    ['hr_interview', 45, 'recruiter', 'Colloquio conoscitivo'],
    ['manager_interview', 60, 'hiring_manager', 'Colloquio con la responsabile'],
  ]),
  summary: 'Accompagnerai gli studi medici dai primi giorni sulla piattaforma fino al rinnovo, con un portafoglio di circa 120 clienti.',
  responsibilities: ['Guidare l’avvio dei nuovi clienti', 'Raccogliere richieste e portarle al team prodotto', 'Seguire i rinnovi annuali'],
  requirements: { mustHave: ['Almeno 2 anni in customer success o account management', 'Ottimo italiano scritto e parlato'], niceToHave: ['Esperienza con software gestionali'] },
  technologies: ['HubSpot', 'Intercom'],
  benefits: ['Buoni pasto da 8 €', 'Assicurazione sanitaria integrativa'],
  growth: '',
  workLifeBalance: '',
  culture: '',
} as const;

/** The Backend job first: the pipeline and the editor screenshots use it. */
export const JOBS = [BACKEND_JOB, DESIGNER_JOB, DATA_JOB, SUPPORT_JOB] as const;
