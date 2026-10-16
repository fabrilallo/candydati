import { jobContentSchema, QUALITY_CATEGORIES, type AdQualityAssessment, type JobContent, type JobDto, type Role } from '@candydati/domain'

export const NOW = '2026-10-13T10:00:00.000Z'

export const incompleteContent: JobContent = jobContentSchema.parse({ title: 'Backend developer' })

export const completeContent: JobContent = jobContentSchema.parse({
  title: 'Backend developer',
  language: 'it',
  role: 'backend_developer',
  seniority: 'senior',
  contractType: 'permanent',
  salary: { min: 45000, max: 60000, currency: 'EUR', period: 'year' },
  workMode: 'hybrid',
  location: { country: 'IT', city: 'Milano', onsiteDaysPerWeek: 2 },
  process: [
    { type: 'screening_call', durationMinutes: 30, conductedBy: 'recruiter' },
    { type: 'technical_interview', durationMinutes: 90, conductedBy: 'technical_lead', note: 'Pair su un problema reale' },
  ],
  responseDays: 5,
  summary: 'Costruisci la piattaforma.',
  responsibilities: ['Sviluppare API', 'Revisionare codice', 'Migliorare le performance'],
  requirements: { mustHave: ['TypeScript'], niceToHave: ['Postgres'] },
  technologies: ['Node.js'],
  benefits: ['Buoni pasto'],
  growth: 'Budget formazione',
  workLifeBalance: '',
  culture: 'Trasparenza',
})

export const makeJob = (overrides: Partial<JobDto> = {}): JobDto => ({
  id: 'j1',
  slug: 'backend-developer-abc123',
  status: 'draft',
  content: completeContent,
  quality: null,
  publishIssues: [],
  complianceWarnings: [],
  createdAt: NOW,
  updatedAt: NOW,
  publishedAt: null,
  closedAt: null,
  ...overrides,
})

export const makeAssessment = (total: number, threshold = 6): AdQualityAssessment => ({
  report: {
    scores: Object.fromEntries(QUALITY_CATEGORIES.map((category) => [category, total / 10])) as never,
    total,
    vaguePhrases: [{ text: 'stipendio competitivo', category: 'salary_transparency', suggestion: 'Indica la fascia' }],
    improvements: ['Descrivi i benefit'],
    source: 'rules',
  },
  threshold,
  belowThreshold: total < threshold,
})

export const viewerWith = (role: Role) => ({
  user: { id: 'u1', name: 'Ada', email: 'ada@example.com' },
  organization: { id: 'o1', name: 'Acme', slug: 'acme' },
  role,
})

export const ok = (data: unknown, meta?: unknown) => ({ success: true, data, error: null, ...(meta ? { meta } : {}) })
