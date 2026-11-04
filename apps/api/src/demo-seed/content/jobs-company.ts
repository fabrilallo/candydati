import type { DemoJobSpec } from './types.js';

/** Ads of the organization itself: a software company for medical practices. Invented, Italian, complete. */

const HYBRID_MILANO = { workMode: 'hybrid', location: { country: 'IT', city: 'Milano', onsiteDaysPerWeek: 2 } } as const;
const BENEFITS = ['Buoni pasto da 8 € al giorno', '1.500 € l’anno per la formazione', 'Assicurazione sanitaria integrativa', 'Orario flessibile'];

export const BACKEND_JOB: DemoJobSpec = {
  key: 'backend',
  status: 'published',
  createdDaysAgo: 30,
  publishedDaysAgo: 26,
  content: {
    title: 'Backend Developer (m/f/x)',
    language: 'it',
    role: 'backend_developer',
    seniority: 'senior',
    contractType: 'permanent',
    salary: { min: 48000, max: 62000, currency: 'EUR', period: 'year' },
    ...HYBRID_MILANO,
    responseDays: 5,
    process: [
      { id: 'chiamata', title: 'Chiamata conoscitiva', type: 'screening_call', durationMinutes: 30, conductedBy: 'recruiter' },
      { id: 'tecnico', title: 'Colloquio tecnico', type: 'technical_interview', durationMinutes: 90, conductedBy: 'technical_lead', note: 'Progettiamo insieme una piccola API: niente quiz, niente lavagna.' },
      { id: 'team', title: 'Incontro con il team', type: 'team_interview', durationMinutes: 60, conductedBy: 'team_member' },
      { id: 'finale', title: 'Colloquio finale e proposta', type: 'final_interview', durationMinutes: 45, conductedBy: 'hiring_manager' },
    ],
    summary:
      'Cerchiamo una persona che progetti e faccia crescere i servizi della nostra piattaforma di prenotazioni per studi medici: API usate ogni giorno da oltre 3.000 strutture in Italia.',
    responsibilities: [
      'Progettare e mantenere API REST in TypeScript e Node.js',
      'Modellare i dati su PostgreSQL e curarne le prestazioni',
      'Rivedere il codice di colleghe e colleghi e farsi rivedere il proprio',
      'Partecipare ai turni di reperibilità, una settimana ogni sei, retribuiti a parte',
    ],
    requirements: {
      mustHave: ['Almeno 4 anni di sviluppo backend in produzione', 'Buona conoscenza di TypeScript o di un altro linguaggio tipizzato', 'Esperienza con database relazionali'],
      niceToHave: ['Esperienza con code di messaggi o job in background', 'Familiarità con OpenTelemetry'],
    },
    technologies: ['TypeScript', 'Node.js', 'Fastify', 'PostgreSQL', 'Docker', 'AWS'],
    benefits: BENEFITS,
    growth: 'Un percorso di crescita scritto, con una revisione ogni sei mesi e una persona di riferimento fin dal primo giorno.',
    workLifeBalance: 'Due giorni a settimana in ufficio a Milano, il resto da dove preferisci. Niente riunioni il venerdì pomeriggio.',
    culture: 'Team di 14 persone, decisioni scritte, rilasci piccoli e frequenti.',
  },
  restrictedStages: ['finale'],
  criteria: [
    { key: 'api', label: 'Progettazione di API REST', stageId: 'tecnico' },
    { key: 'postgres', label: 'PostgreSQL in produzione', stageId: 'tecnico' },
    { key: 'collab', label: 'Collaborazione e revisione del codice', stageId: null },
    { key: 'clarity', label: 'Chiarezza nello spiegare le scelte', stageId: 'team' },
  ],
  automations: [
    { key: 'invite', stageId: 'tecnico', action: { type: 'send_template', templateId: 'technical-invite' } },
    { key: 'offer-task', stageId: 'finale', action: { type: 'create_task', title: 'Preparare la proposta economica', assignee: 'job_owner', dueInDays: 2 } },
  ],
  interviewers: [
    { stageId: 'tecnico', kind: 'owner' },
    { stageId: 'team', kind: 'external', name: 'Luca Moretti', email: 'luca.moretti@demo.example.com' },
  ],
  quality: {
    scores: { role_requirements: 1, benefits: 1, growth: 1, work_life_balance: 1, responsibilities_clarity: 1, culture: 0.5, technologies: 1 },
    vaguePhrases: [
      { text: 'decisioni scritte', category: 'culture', suggestion: 'Spiega dove si scrivono le decisioni e chi le prende: per esempio "ogni scelta tecnica rilevante ha un documento breve, discusso in team prima di partire".' },
    ],
    improvements: ['Racconta un esempio concreto di come lavora il team in una settimana tipo.'],
  },
  client: null,
  profile: 'backend',
  pipeline: [
    { stage: 'received', count: 4 },
    { stage: 'chiamata', count: 3 },
    { stage: 'tecnico', count: 3 },
    { stage: 'team', count: 1 },
    { stage: 'finale', count: 1 },
    { stage: 'chiamata', count: 1, outcome: 'withdrawn' },
    { stage: 'tecnico', count: 1, outcome: 'not_selected' },
  ],
};

export const DESIGNER_JOB: DemoJobSpec = {
  key: 'designer',
  status: 'published',
  createdDaysAgo: 16,
  publishedDaysAgo: 14,
  content: {
    title: 'Product Designer (m/f/x)',
    language: 'it',
    role: 'product_designer',
    seniority: 'mid',
    contractType: 'permanent',
    salary: { min: 38000, max: 48000, currency: 'EUR', period: 'year' },
    ...HYBRID_MILANO,
    responseDays: 7,
    process: [
      { id: 'chiamata', title: 'Chiamata conoscitiva', type: 'screening_call', durationMinutes: 30, conductedBy: 'recruiter' },
      { id: 'portfolio', title: 'Revisione del portfolio', type: 'case_study', durationMinutes: 90, conductedBy: 'hiring_manager', note: 'Porta due progetti: ci interessa il percorso, non solo il risultato.' },
      { id: 'team', title: 'Incontro con il team', type: 'team_interview', durationMinutes: 60, conductedBy: 'team_member' },
    ],
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
    benefits: BENEFITS,
    growth: 'Budget per conferenze di design e un’ora a settimana dedicata alla ricerca.',
    workLifeBalance: 'Due giorni in ufficio, orari flessibili tra le 8 e le 19.',
    culture: 'Un team prodotto di 9 persone che lavora a stretto contatto con il supporto clienti.',
  },
  restrictedStages: ['team'],
  criteria: [
    { key: 'research', label: 'Ricerca con gli utenti', stageId: 'portfolio' },
    { key: 'systems', label: 'Lavoro con un design system', stageId: null },
  ],
  automations: [{ key: 'brief-task', stageId: 'portfolio', action: { type: 'create_task', title: 'Inviare le istruzioni per la revisione del portfolio', assignee: 'job_owner', dueInDays: 1 } }],
  interviewers: [{ stageId: 'portfolio', kind: 'external', name: 'Chiara Esposito', email: 'chiara.esposito@demo.example.com' }],
  quality: {
    scores: { role_requirements: 1, benefits: 1, growth: 0.5, work_life_balance: 1, responsibilities_clarity: 1, culture: 0.5, technologies: 1 },
    vaguePhrases: [
      { text: 'Orario flessibile', category: 'work_life_balance', suggestion: 'Indica la fascia: per esempio "inizio tra le 8 e le 10, nessuna riunione dopo le 17".' },
    ],
    improvements: ['Descrivi come si cresce nel ruolo: chi ti segue e ogni quanto se ne parla.'],
  },
  client: null,
  profile: 'design',
  pipeline: [
    { stage: 'received', count: 3 },
    { stage: 'chiamata', count: 2 },
    { stage: 'portfolio', count: 2 },
    { stage: 'team', count: 1 },
    { stage: 'received', count: 1, outcome: 'not_selected' },
  ],
};

/** A draft still being written: complete enough to publish, so the editor shows the checks passing. */
export const FRONTEND_DRAFT: DemoJobSpec = {
  key: 'frontend',
  status: 'draft',
  createdDaysAgo: 2,
  content: {
    title: 'Frontend Developer (m/f/x)',
    language: 'it',
    role: 'frontend_developer',
    seniority: 'mid',
    contractType: 'permanent',
    salary: { min: 40000, max: 50000, currency: 'EUR', period: 'year' },
    workMode: 'remote',
    location: { country: 'IT' },
    responseDays: 5,
    process: [
      { id: 'chiamata', title: 'Chiamata conoscitiva', type: 'screening_call', durationMinutes: 30, conductedBy: 'recruiter' },
      { id: 'esercizio', title: 'Esercizio dal vivo', type: 'live_exercise', durationMinutes: 75, conductedBy: 'technical_lead' },
      { id: 'team', title: 'Incontro con il team', type: 'team_interview', durationMinutes: 45, conductedBy: 'team_member' },
    ],
    summary: 'Costruirai le schermate che pazienti e segreterie usano ogni giorno, con attenzione ad accessibilità e prestazioni.',
    responsibilities: [
      'Sviluppare interfacce in Vue e TypeScript',
      'Curare l’accessibilità dei flussi di prenotazione',
      'Scrivere test dei componenti e dei flussi principali',
    ],
    requirements: { mustHave: ['Almeno 3 anni di sviluppo frontend', 'Esperienza con un framework moderno (Vue, React o simili)'], niceToHave: ['Conoscenza delle WCAG'] },
    technologies: ['Vue', 'TypeScript', 'Vite', 'Playwright'],
    benefits: ['1.500 € l’anno per la formazione', 'Assicurazione sanitaria integrativa', 'Contributo di 600 € per la postazione a casa'],
  },
  restrictedStages: [],
  criteria: [],
  automations: [],
  interviewers: [],
  quality: null,
  client: null,
  profile: 'frontend',
  pipeline: [],
};
