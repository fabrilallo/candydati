import type { Application, Candidate, CandidateNote, CvExtractionRecord, PrivacyNotice, PrivacyNoticeInput } from '@candydati/domain';

const DATE = new Date('2026-01-01T00:00:00.000Z');

/** A tiny but sniffable PDF: starts with the `%PDF-` magic bytes. */
export const fakePdfBytes = (size = 64): Uint8Array => {
  const bytes = new Uint8Array(Math.max(size, 8));
  [...'%PDF-1.7'].forEach((char, index) => {
    bytes[index] = char.charCodeAt(0);
  });
  return bytes;
};

export const fakeDocxBytes = (): Uint8Array => new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);

const NOTICE_TEXT = 'Informativa sul trattamento dei dati dei candidati. '.repeat(6).trim();

export const completePrivacyNoticeInput = (overrides: Partial<PrivacyNoticeInput> = {}): PrivacyNoticeInput => ({
  language: 'it',
  text: NOTICE_TEXT,
  contactEmail: 'privacy@acme.example',
  retentionDays: { selection: 365, talent_pool: 730 },
  ...overrides,
});

export const buildPrivacyNotice = (overrides: Partial<PrivacyNotice> = {}): PrivacyNotice => ({
  ...completePrivacyNoticeInput(),
  id: 'notice_1',
  organizationId: 'org_test',
  version: 1,
  createdBy: 'user_test',
  createdAt: DATE,
  ...overrides,
});

export const validApplicationForm = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  message: 'Hello',
  consentScopes: ['selection'],
  privacyNoticeVersion: 1,
  ...overrides,
});

export const buildCandidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  id: 'cand_1',
  organizationId: 'org_test',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: null,
  linkedinUrl: null,
  tags: [],
  talentPool: false,
  retentionExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
  importBatchId: null,
  createdAt: DATE,
  updatedAt: DATE,
  ...overrides,
});

export const buildApplication = (overrides: Partial<Application> = {}): Application => ({
  id: 'app_1',
  organizationId: 'org_test',
  jobId: 'job_1',
  candidateId: 'cand_1',
  stageId: 'received',
  outcome: null,
  message: '',
  cv: { key: 'organizations/org_test/applications/app_1/cv', fileName: 'cv.pdf', mediaType: 'application/pdf', sizeBytes: 64 },
  consent: { privacyNoticeId: 'notice_1', privacyNoticeVersion: 1, scopes: ['selection'], givenAt: DATE },
  consentStatus: 'given',
  importBatchId: null,
  retentionExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
  source: 'careers_page',
  origin: 'direct',
  createdAt: DATE,
  updatedAt: DATE,
  stageChangedAt: DATE,
  closedAt: null,
  responseDueAt: null,
  respondedAt: null,
  ...overrides,
});

export const buildNote = (overrides: Partial<CandidateNote> = {}): CandidateNote => ({
  id: 'note_1',
  organizationId: 'org_test',
  candidateId: 'cand_1',
  applicationId: null,
  authorId: 'user_test',
  authorName: null,
  body: 'Strong profile.',
  createdAt: DATE,
  ...overrides,
});

export const buildExtraction = (overrides: Partial<CvExtractionRecord> = {}): CvExtractionRecord => ({
  applicationId: 'app_1',
  organizationId: 'org_test',
  status: 'done',
  text: 'Senior engineer with Kubernetes experience',
  data: { headline: 'Senior engineer', location: 'Milano', yearsOfExperience: 8, experiences: [], education: [], skills: [], languages: [] },
  source: 'model',
  updatedAt: DATE,
  ...overrides,
});
