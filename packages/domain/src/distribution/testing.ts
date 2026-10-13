import { isPublishedContent, jobContentSchema, type JobContentInput, type PublishedJobContent } from '../job/content.js';
import type { PublicJobDto, PublicOrganizationDto } from '../job/job.js';

/** Fixtures for the tests of the feed builders (and of the apps that use them). Not exported from the package index. */
export const COMPLETE_CONTENT: JobContentInput = {
  title: 'Backend Developer',
  language: 'it',
  role: 'backend_developer',
  seniority: 'senior',
  contractType: 'permanent',
  salary: { min: 45000, max: 60000, currency: 'EUR', period: 'year' },
  workMode: 'hybrid',
  location: { country: 'IT', city: 'Milano', onsiteDaysPerWeek: 2 },
  process: [
    { type: 'screening_call', durationMinutes: 30, conductedBy: 'recruiter' },
    { type: 'technical_interview', durationMinutes: 60, conductedBy: 'team_member' },
  ],
  responseDays: 7,
  summary: 'Costruiamo prodotti.',
  responsibilities: ['Progettare API', 'Scrivere test', 'Monitorare'],
  requirements: { mustHave: ['TypeScript'], niceToHave: ['Go'] },
  technologies: ['Node.js'],
  benefits: ['Buoni pasto'],
  growth: 'Crescita annuale.',
  workLifeBalance: 'Orario flessibile.',
  culture: 'Feedback continuo.',
};

export const publishedContent = (overrides: Record<string, unknown> = {}): PublishedJobContent => {
  const content = jobContentSchema.parse({ ...COMPLETE_CONTENT, ...overrides });
  if (!isPublishedContent(content)) throw new Error('fixture is not publishable');
  return content;
};

export const publicJob = (overrides: Record<string, unknown> = {}, slug = 'backend-developer-a1b2c3'): PublicJobDto => ({
  slug,
  content: publishedContent(overrides),
  publishedAt: '2026-10-13T09:00:00.000Z',
  updatedAt: '2026-10-14T09:00:00.000Z',
});

export const ORGANIZATION: PublicOrganizationDto = { name: 'Acme', slug: 'acme', logo: null };
export const BASE_URL = 'https://jobs.example.com';
