import {
  jobContentSchema,
  type AdQualityAnalyzer,
  type AdQualityReport,
  type Job,
  type JobContent,
  type JobContentInput,
  type JobTemplate,
} from '@candydati/domain';

/** A content that passes `checkPublishable`. Overrides are parsed, so defaults apply. */
export const completeJobContent = (overrides: JobContentInput = { title: 'Backend Developer' }): JobContent =>
  jobContentSchema.parse({
    language: 'it',
    role: 'backend_developer',
    seniority: 'mid',
    contractType: 'permanent',
    salary: { min: 35000, max: 45000, currency: 'EUR', period: 'year' },
    workMode: 'hybrid',
    location: { country: 'IT', city: 'Milano', onsiteDaysPerWeek: 2 },
    process: [
      { type: 'hr_interview', durationMinutes: 30, conductedBy: 'recruiter' },
      { type: 'technical_interview', durationMinutes: 60, conductedBy: 'technical_lead' },
    ],
    responseDays: 5,
    summary: 'Build the core API.',
    responsibilities: ['Design APIs', 'Review code', 'Operate services'],
    requirements: { mustHave: ['3 years of TypeScript'], niceToHave: [] },
    ...overrides,
  });

export const fixedQualityReport = (total = 8): AdQualityReport => ({
  scores: {
    selection_process: 1,
    role_requirements: 1,
    work_mode: 1,
    salary_transparency: 1,
    benefits: 0.5,
    growth: 0.5,
    work_life_balance: 0.5,
    responsibilities_clarity: 1,
    culture: 0.5,
    technologies: 0.5,
  },
  total,
  vaguePhrases: [],
  improvements: [],
  source: 'rules',
});

/** Always returns the same report. */
export const fakeAdQualityAnalyzer = (report: AdQualityReport = fixedQualityReport()): AdQualityAnalyzer => ({
  analyze: async () => report,
});

/** An analyzer that always rejects. */
export const throwingAdQualityAnalyzer = (error: Error = new Error('analyzer down')): AdQualityAnalyzer => ({
  analyze: async () => {
    throw error;
  },
});

const DATE = new Date('2026-01-01T00:00:00.000Z');

export const buildJob = (overrides: Partial<Job> = {}): Job => ({
  id: 'job_1',
  organizationId: 'org_test',
  slug: 'backend-developer-abc123',
  status: 'draft',
  content: completeJobContent(),
  quality: null,
  createdBy: 'user_test',
  createdAt: DATE,
  updatedAt: DATE,
  publishedAt: null,
  closedAt: null,
  ...overrides,
});

export const buildJobTemplate = (overrides: Partial<JobTemplate> = {}): JobTemplate => ({
  id: 'tpl_1',
  organizationId: 'org_test',
  name: 'Standard engineering',
  content: completeJobContent(),
  createdBy: 'user_test',
  createdAt: DATE,
  updatedAt: DATE,
  ...overrides,
});
