import { STATS_WEEKS, type JobStatsDto } from '@candydati/domain'

const weeks = (): JobStatsDto['weekly'] =>
  Array.from({ length: STATS_WEEKS }, (_, index) => {
    const date = new Date(Date.UTC(2026, 6, 20 + index * 7))
    return { weekStart: date.toISOString().slice(0, 10), created: index % 3, published: index % 4 === 0 ? 1 : 0 }
  })

/** A realistic stats payload: two currencies, one ad under the threshold, two drafts with blockers. */
export const jobStatsFixture = (overrides: Partial<JobStatsDto> = {}): JobStatsDto => ({
  generatedAt: '2026-10-13T10:00:00.000Z',
  statusCounts: { draft: 2, published: 3, closed: 1, total: 6 },
  weekly: weeks(),
  quality: {
    available: true,
    threshold: 6,
    items: [
      { id: 'j3', title: 'Data Engineer', total: 4.5, belowThreshold: true },
      { id: 'j1', title: 'Backend developer', total: 7, belowThreshold: false },
      { id: 'j2', title: 'Designer', total: 8.5, belowThreshold: false },
    ],
    average: 6.7,
    belowCount: 1,
  },
  salary: {
    items: [
      { id: 'j1', title: 'Backend developer', role: 'backend_developer', min: 40000, max: 52000, currency: 'EUR', period: 'year' },
      { id: 'j3', title: 'Data Engineer', role: 'data_engineer', min: 45000, max: 60000, currency: 'EUR', period: 'year' },
      { id: 'j2', title: 'Designer', role: 'product_designer', min: 5000, max: 6500, currency: 'CHF', period: 'month' },
    ],
    medians: [
      { currency: 'EUR', period: 'year', count: 2, medianMin: 42500, medianMax: 56000 },
      { currency: 'CHF', period: 'month', count: 1, medianMin: 5000, medianMax: 6500 },
    ],
  },
  process: { jobCount: 3, averageStages: 2.7, averageProcessMinutes: 150, averageResponseDays: 4.3 },
  readiness: {
    draftCount: 2,
    readyCount: 0,
    blockers: [
      { rule: 'required', path: 'salary.min', drafts: 2 },
      { rule: 'too_few_stages', path: 'process', drafts: 1 },
    ],
  },
  ...overrides,
})

export const emptyJobStats = (): JobStatsDto =>
  jobStatsFixture({
    statusCounts: { draft: 0, published: 0, closed: 0, total: 0 },
    weekly: weeks().map((week) => ({ ...week, created: 0, published: 0 })),
    quality: { available: true, threshold: 6, items: [], average: null, belowCount: 0 },
    salary: { items: [], medians: [] },
    process: { jobCount: 0, averageStages: null, averageProcessMinutes: null, averageResponseDays: null },
    readiness: { draftCount: 0, readyCount: 0, blockers: [] },
  })
