import type { ApplicationCardDto, CandidateDetailDto, CandidateSummaryDto, NoteDto, PipelineDto, PrivacyNoticeDto, PublicPrivacyNoticeDto } from '../../app/lib/candidate-schemas'

export const T0 = '2026-10-13T10:00:00.000Z'
export const PRIVACY_TEXT = `${'Titolare del trattamento: Acme. '.repeat(5)}\n\nI tuoi dati servono solo per la selezione. ${'Puoi chiedere accesso e cancellazione. '.repeat(3)}`

export const publicNotice = (overrides: Partial<PublicPrivacyNoticeDto> = {}): PublicPrivacyNoticeDto => ({
  version: 3,
  language: 'it',
  text: PRIVACY_TEXT,
  contactEmail: 'privacy@acme.test',
  retentionDays: { selection: 365, talent_pool: 730 },
  ...overrides,
})

export const notice = (overrides: Partial<PrivacyNoticeDto> = {}): PrivacyNoticeDto => ({
  id: 'pn3',
  ...publicNotice(),
  createdAt: T0,
  ...overrides,
})

export const card = (id: string, stageId = 'received', overrides: Partial<ApplicationCardDto> = {}): ApplicationCardDto => ({
  id,
  jobId: 'j1',
  stageId,
  outcome: null,
  createdAt: T0,
  stageChangedAt: T0,
  closedAt: null,
  noteCount: 0,
  stageRemoved: false,
  responseDueAt: null,
  respondedAt: null,
  responseState: null,
  candidate: { id: `c-${id}`, firstName: 'Giulia', lastName: `Rossi ${id}`, tags: [], headline: 'Backend engineer', location: 'Milano', yearsOfExperience: 6, consentStatus: 'given', importBatchId: null },
  consentStatus: 'given',
  importBatchId: null,
  retentionExpiresAt: null,
  ...overrides,
})

const STAGES = [
  { id: 'received', declared: null },
  { id: 'stage-0', declared: { type: 'screening_call' as const, durationMinutes: 30, conductedBy: 'recruiter' as const } },
  { id: 'stage-1', declared: { type: 'technical_interview' as const, durationMinutes: 90, conductedBy: 'technical_lead' as const } },
]

export const pipeline = (applications: readonly ApplicationCardDto[] = [card('a1'), card('a2', 'stage-0'), card('a3', 'stage-1')]): PipelineDto => ({
  job: { id: 'j1', title: 'Backend developer', status: 'published' },
  stages: STAGES.map((stage) => ({ ...stage, count: applications.filter((app) => app.stageId === stage.id && app.outcome === null).length })),
  applications: [...applications],
})

export const note = (id: string, overrides: Partial<NoteDto> = {}): NoteDto => ({
  id,
  applicationId: 'a1',
  author: { id: 'u1', name: 'Ada Lovelace' },
  body: 'Ottima chiamata, molto chiara sulle aspettative.',
  createdAt: T0,
  ...overrides,
})

export const detail = (overrides: Partial<CandidateDetailDto> = {}): CandidateDetailDto => ({
  candidate: {
    id: 'c1',
    firstName: 'Giulia',
    lastName: 'Rossi',
    email: 'giulia@example.com',
    phone: '+39 333 1234567',
    linkedinUrl: 'https://www.linkedin.com/in/giulia',
    tags: ['typescript'],
    talentPool: true,
    retentionExpiresAt: '2028-10-13T10:00:00.000Z',
    createdAt: T0,
    consentStatus: 'given',
    importBatchId: null,
  },
  applications: [
    {
      id: 'a1',
      job: { id: 'j1', title: 'Backend developer', slug: 'backend-developer' },
      stageId: 'stage-0',
      stageRemoved: false,
      stages: pipeline().stages.map(({ id, declared }) => ({ id, declared })),
      outcome: null,
      message: 'Mi piacerebbe lavorare con voi.',
      createdAt: T0,
      stageChangedAt: T0,
      closedAt: null,
      consent: { status: 'given', privacyNoticeVersion: 3, scopes: ['selection', 'talent_pool'], givenAt: T0 },
      consentStatus: 'given',
      importBatchId: null,
      retentionExpiresAt: '2028-10-13T10:00:00.000Z',
      cv: { fileName: 'giulia-rossi.pdf', mediaType: 'application/pdf', sizeBytes: 1_572_864 },
      messageCount: 2,
      responseDueAt: null,
      respondedAt: null,
      responseState: null,
      extraction: {
        status: 'done',
        source: 'model',
        data: {
          headline: 'Backend engineer',
          location: 'Milano',
          yearsOfExperience: 6,
          experiences: [{ title: 'Backend engineer', company: 'Beta', from: '2021', to: 'oggi', summary: 'API e pagamenti' }],
          education: [{ title: 'Laurea in Informatica', institution: 'Politecnico di Milano', year: '2018' }],
          skills: ['TypeScript', 'Postgres'],
          languages: ['Italiano', 'Inglese'],
        },
      },
    },
  ],
  notes: [note('n1')],
  ...overrides,
})

export const summary = (id: string, overrides: Partial<CandidateSummaryDto> = {}): CandidateSummaryDto => ({
  id,
  firstName: 'Giulia',
  lastName: `Rossi ${id}`,
  email: `${id}@example.com`,
  tags: ['typescript'],
  talentPool: false,
  applicationCount: 1,
  lastAppliedAt: T0,
  retentionExpiresAt: '2027-10-13T10:00:00.000Z',
  consentStatus: 'given',
  importBatchId: null,
  ...overrides,
})
