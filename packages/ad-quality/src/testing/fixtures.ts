import { jobContentSchema, type JobContent, type JobContentInput } from '@tt/domain';

export const draft = (input: Partial<JobContentInput> = {}): JobContent => jobContentSchema.parse({ title: 'Backend Developer', ...input });

export const richAd = (overrides: Partial<JobContentInput> = {}): JobContent =>
  draft({
    language: 'it',
    workMode: 'hybrid',
    location: { country: 'IT', city: 'Milano', onsiteDaysPerWeek: 2 },
    salary: { min: 45000, max: 60000, currency: 'EUR', period: 'year' },
    process: [
      { type: 'screening_call', durationMinutes: 30, conductedBy: 'recruiter' },
      { type: 'technical_interview', durationMinutes: 60, conductedBy: 'technical_lead' },
      { type: 'final_interview', durationMinutes: 45, conductedBy: 'hiring_manager' },
    ],
    responseDays: 5,
    responsibilities: [
      'Progettare e mantenere le API del servizio ordini, con latenza p95 sotto 200 ms',
      'Ridurre del 30% i tempi di build entro fine anno',
      'Partecipare alle code review e al turno di reperibilità una settimana su otto',
    ],
    requirements: {
      mustHave: ['Almeno 3 anni di esperienza con Node.js e TypeScript', 'Esperienza con PostgreSQL in produzione', 'Inglese scritto livello B2'],
      niceToHave: ['Esperienza con Kubernetes'],
    },
    technologies: ['TypeScript 5', 'Node.js 22', 'PostgreSQL 17', 'Kubernetes', 'Terraform'],
    benefits: ['Buoni pasto da 8 euro al giorno', 'Polizza sanitaria integrativa', '25 giorni di ferie', 'Budget hardware di 2.500 euro'],
    growth: 'Budget annuo di 1.500 euro per formazione e conferenze, mentoring con un senior e revisione salariale ogni 12 mesi.',
    workLifeBalance: 'Orario flessibile con ingresso tra le 8 e le 10, 2 giorni di smart working a settimana e 4 ore di permessi al mese.',
    culture: 'Feedback 1:1 ogni due settimane, retrospettiva a fine sprint, code review obbligatoria e un hackathon interno ogni trimestre.',
    ...overrides,
  });
