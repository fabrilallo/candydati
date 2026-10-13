import { rate, type ReportKey, type ReportsDto } from '@tt/domain'

/** The report as the web reads it: the api answer plus the sections that failed validation (none here). */
export type ReportsFixture = ReportsDto & { readonly invalid: readonly ReportKey[] }

const NO_OUTCOMES = { hired: 0, not_selected: 0, withdrawn: 0 }

/**
 * A report with every section filled: four hires over two jobs, a funnel of four stages (given out of order), four
 * sources (one too small for a rate), and 50 closed response promises (47 kept).
 */
export const reportsFixture = (overrides: Partial<ReportsDto> = {}): ReportsFixture => ({
  invalid: [],
  generatedAt: '2026-10-13T10:00:00.000Z',
  period: { from: '2026-09-14T00:00:00.000Z', to: '2026-10-13T23:59:59.999Z' },
  jobId: null,
  minSample: 5,
  timeToHire: {
    overall: { count: 4, median: 24, p75: 31 },
    byJob: [
      { jobId: 'j1', title: 'Data Engineer', count: 3, median: 20, p75: 30 },
      { jobId: 'j2', title: 'Backend <Developer>', count: 1, median: 36, p75: 36 },
    ],
  },
  timeToFill: {
    overall: { count: 3, median: 36, p75: 40 },
    items: [
      { jobId: 'j1', title: 'Data Engineer', publishedAt: '2026-08-01T10:00:00.000Z', firstHireAt: '2026-09-10T10:00:00.000Z', days: 40 },
      { jobId: 'j2', title: 'Backend <Developer>', publishedAt: '2026-08-20T10:00:00.000Z', firstHireAt: '2026-09-25T10:00:00.000Z', days: 36 },
      { jobId: 'j3', title: 'Product Designer', publishedAt: '2026-09-20T10:00:00.000Z', firstHireAt: '2026-10-02T10:00:00.000Z', days: 12 },
    ],
  },
  funnel: {
    stages: [
      { position: null, stageId: null, title: null, type: 'received', entered: 40, conversionToNext: rate(20, 40) },
      { position: null, stageId: null, title: null, type: 'screening_call', entered: 20, conversionToNext: rate(10, 20) },
      { position: null, stageId: null, title: null, type: 'technical_interview', entered: 10, conversionToNext: rate(4, 10) },
      { position: null, stageId: null, title: null, type: 'final_interview', entered: 4, conversionToNext: null },
    ],
    outcomes: { hired: 4, not_selected: 22, withdrawn: 3 },
    outcomesByJob: [{ jobId: 'j1', title: 'Data Engineer', hired: 3, not_selected: 15, withdrawn: 2 }],
  },
  sources: [
    { origin: 'import', applications: 5, hires: 0 },
    { origin: 'linkedin', applications: 20, hires: 2 },
    { origin: 'newsletter', applications: 3, hires: 1 },
    { origin: 'direct', applications: 12, hires: 1 },
  ],
  responses: {
    closed: rate(47, 50),
    kept: 47,
    missed: 3,
    responseHours: { count: 50, median: 30, p75: 52 },
    open: 6,
    overdue: 1,
    byJob: [
      { jobId: 'j1', title: 'Data Engineer', kept: 40, missed: 2, keptRate: rate(40, 42) },
      { jobId: 'j2', title: 'Backend <Developer>', kept: 7, missed: 1, keptRate: rate(7, 8) },
    ],
    byStageType: [
      { type: 'screening_call', kept: 5, missed: 0, keptRate: rate(5, 5) },
      { type: 'received', kept: 30, missed: 2, keptRate: rate(30, 32) },
      { type: 'final_interview', kept: 0, missed: 0, keptRate: rate(0, 0) },
      { type: 'technical_interview', kept: 12, missed: 1, keptRate: rate(12, 13) },
    ],
  },
  outcomeCoverage: rate(18, 20),
  ...overrides,
})

/** Nothing happened in the period. */
export const emptyReportsFixture = (): ReportsFixture =>
  reportsFixture({
    timeToHire: { overall: { count: 0, median: null, p75: null }, byJob: [] },
    timeToFill: { overall: { count: 0, median: null, p75: null }, items: [] },
    funnel: { stages: [], outcomes: NO_OUTCOMES, outcomesByJob: [] },
    sources: [],
    responses: { closed: rate(0, 0), kept: 0, missed: 0, responseHours: { count: 0, median: null, p75: null }, open: 0, overdue: 0, byJob: [], byStageType: [] },
    outcomeCoverage: rate(0, 0),
  })
