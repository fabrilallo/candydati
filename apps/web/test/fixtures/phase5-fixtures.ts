import type { DataExportDto, ProcessingRecordDto, RetentionOverviewDto, RetentionRunDto, RetentionUpcomingDto } from '@candydati/domain'

export const upcoming = (id: string, overrides: Partial<RetentionUpcomingDto> = {}): RetentionUpcomingDto => ({
  applicationId: id,
  candidateId: `c-${id}`,
  jobTitle: 'Backend developer',
  candidateName: 'Marta Verdi',
  retentionExpiresAt: '2026-10-25T10:00:00.000Z',
  ...overrides,
})

export const run = (id: string, overrides: Partial<RetentionRunDto> = {}): RetentionRunDto => ({
  id,
  startedAt: '2026-10-13T01:00:00.000Z',
  warned: 2,
  erased: 1,
  ...overrides,
})

export const retentionOverview = (overrides: Partial<RetentionOverviewDto> = {}): RetentionOverviewDto => ({
  upcoming: [upcoming('a1'), upcoming('a2', { candidateName: 'Luca Neri', jobTitle: 'Designer', retentionExpiresAt: '2026-10-18T10:00:00.000Z' })],
  lastRuns: [run('r1')],
  ...overrides,
})

export const dataExport = (id: string, overrides: Partial<DataExportDto> = {}): DataExportDto => ({
  id,
  status: 'ready',
  sizeBytes: 2_621_440,
  createdAt: '2026-10-13T09:00:00.000Z',
  completedAt: '2026-10-13T09:01:00.000Z',
  expiresAt: '2026-10-20T09:01:00.000Z',
  ...overrides,
})

export const processingRecord = (overrides: Partial<ProcessingRecordDto> = {}): ProcessingRecordDto => ({
  organization: { name: 'Acme', contactEmail: 'privacy@acme.test' },
  privacyNoticeVersion: 3,
  retentionDays: { selection: 365, talent_pool: 730 },
  providers: { storage: 's3', email: 'smtp', model: 'mistral/mistral-small' },
  generatedAt: '2026-10-13T10:00:00.000Z',
  ...overrides,
})
