import { describe, expect, it } from 'vitest';
import {
  MIGRATION_LIMITS,
  MIGRATION_PACKAGE_SCHEMA_ID,
  isMigrationFilePath,
  migrationPackageJsonSchema,
  parseMigrationPackage,
} from './package.js';

const minimal = {
  format: 'candydati-migration',
  version: 1,
  source: { system: 'teamtailor', exportedAt: '2026-10-01T10:00:00Z', producer: 'connector:teamtailor@1' },
  users: [{ ref: 'u1', name: 'Giulia Rossi', email: 'giulia@example.com' }],
  jobs: [
    {
      ref: 'j1',
      title: 'Backend Developer',
      status: 'closed',
      createdAt: '2025-01-10T09:00:00Z',
      closedAt: '2025-03-01T09:00:00Z',
      stages: [{ ref: 's1', name: 'Colloquio HR', type: 'hr_interview' }],
    },
  ],
  candidates: [
    {
      ref: 'c1',
      firstName: 'Ada',
      lastName: 'Bianchi',
      email: 'ada@example.com',
      createdAt: '2025-01-12T09:00:00Z',
      consent: { givenAt: '2025-01-12T09:00:00Z' },
    },
  ],
  applications: [
    {
      ref: 'a1',
      candidateRef: 'c1',
      jobRef: 'j1',
      stageRef: 's1',
      createdAt: '2025-01-12T09:00:00Z',
      outcome: 'not_selected',
      closedAt: '2025-02-01T09:00:00Z',
      files: [{ path: 'files/a1/cv.pdf', kind: 'cv', fileName: 'cv.pdf' }],
      stageHistory: [{ stageRef: 's1', enteredAt: '2025-01-20T09:00:00Z' }],
    },
  ],
  notes: [
    { candidateRef: 'c1', applicationRef: 'a1', authorRef: 'u1', body: 'Ottimo colloquio', createdAt: '2025-01-21T09:00:00Z' },
  ],
  messages: [] as unknown[],
};

type Pkg = typeof minimal;
const job = minimal.jobs[0]!;
const candidate = minimal.candidates[0]!;
const application = minimal.applications[0]!;
const note = minimal.notes[0]!;

const withJob = (patch: Record<string, unknown>): Pkg => ({ ...minimal, jobs: [{ ...job, ...patch }] }) as Pkg;
const withCandidate = (patch: Record<string, unknown>): Pkg => ({ ...minimal, candidates: [{ ...candidate, ...patch }] }) as Pkg;
const withApplication = (patch: Record<string, unknown>): Pkg =>
  ({ ...minimal, applications: [{ ...application, ...patch }] }) as Pkg;
const withNote = (patch: Record<string, unknown>): Pkg => ({ ...minimal, notes: [{ ...note, ...patch }] }) as Pkg;

const issuesOf = (input: unknown): string => JSON.stringify(parseMigrationPackage(input).error?.issues ?? []);
const refused = (input: unknown): boolean => !parseMigrationPackage(input).success;

describe('parseMigrationPackage', () => {
  it('accepts a minimal package', () => {
    expect(parseMigrationPackage(minimal).success).toBe(true);
  });

  it('accepts a complete package with every optional field', () => {
    const full = {
      ...minimal,
      jobs: [{ ...job, content: { summary: 'Un ruolo', workMode: 'remote', responsibilities: ['a', 'b', 'c'] } }],
      candidates: [
        {
          ...candidate,
          phone: '+39 333 1234567',
          linkedinUrl: 'https://www.linkedin.com/in/ada',
          tags: ['backend'],
          consent: { givenAt: '2025-01-12T09:00:00+01:00', expiresAt: '2026-01-12T09:00:00Z', scopes: ['selection', 'talent_pool'] },
        },
      ],
      applications: [
        {
          ...application,
          origin: 'linkedin',
          coverLetter: 'Buongiorno',
          answers: [{ question: 'Disponibilità?', answer: 'Subito' }],
          files: [...application.files, { path: 'files/a1/lettera.pdf', kind: 'cover_letter', fileName: 'lettera.pdf' }],
        },
      ],
      notes: [{ ...note, authorRef: undefined, authorName: 'Marco Verdi', private: true }],
      messages: [
        { applicationRef: 'a1', direction: 'outbound', at: '2025-02-01T09:00:00Z', from: 'hr@example.com', to: 'ada@example.com', subject: 'Esito', body: 'Grazie' },
      ],
    };
    const result = parseMigrationPackage(full);
    expect(result.error?.issues).toBeUndefined();
    expect(result.data?.candidates[0]?.tags).toEqual(['backend']);
  });

  it('defaults empty collections and lists', () => {
    const { users: _users, notes: _notes, messages: _messages, ...rest } = minimal;
    const result = parseMigrationPackage({ ...rest, candidates: [{ ...candidate, consent: undefined }] });
    expect(result.success).toBe(true);
    expect(result.data?.users).toEqual([]);
    expect(result.data?.candidates[0]?.tags).toEqual([]);
  });

  it('refuses another format or version', () => {
    expect(refused({ ...minimal, format: 'other' })).toBe(true);
    expect(refused({ ...minimal, version: 2 })).toBe(true);
  });

  it.each(['score', 'rating', 'gender', 'birthDate', 'photo'])('refuses a candidate field %s', (field) => {
    expect(refused(withCandidate({ [field]: 1 }))).toBe(true);
  });

  it.each([
    ['the package', { ...minimal, score: 1 }],
    ['the source', { ...minimal, source: { ...minimal.source, rating: 1 } }],
    ['a user', { ...minimal, users: [{ ...minimal.users[0], photo: 'x' }] }],
    ['a job', withJob({ score: 1 })],
    ['a stage', withJob({ stages: [{ ...job.stages[0], rating: 1 }] })],
    ['job content', withJob({ content: { score: 1 } })],
    ['the consent', withCandidate({ consent: { givenAt: '2025-01-12T09:00:00Z', gender: 'x' } })],
    ['an application', withApplication({ score: 3 })],
    ['a file', withApplication({ files: [{ ...application.files[0], photo: true }] })],
    ['a stage history entry', withApplication({ stageHistory: [{ stageRef: 's1', enteredAt: '2025-01-20T09:00:00Z', rating: 4 }] })],
    ['an answer', withApplication({ answers: [{ question: 'q', answer: 'a', score: 1 }] })],
    ['a note', withNote({ rating: 5 })],
    ['a message', { ...minimal, messages: [{ applicationRef: 'a1', direction: 'inbound', at: '2025-02-01T09:00:00Z', body: 'x', score: 1 }] }],
  ])('refuses unknown fields in %s', (_where, input) => {
    expect(refused(input)).toBe(true);
  });

  it('refuses dates that are not ISO 8601 date-times', () => {
    expect(refused(withCandidate({ createdAt: '12/01/2025' }))).toBe(true);
    expect(refused(withCandidate({ createdAt: '2025-01-12' }))).toBe(true);
  });

  it('refuses unsafe names and malformed contacts', () => {
    expect(refused(withCandidate({ firstName: 'https://evil.example' }))).toBe(true);
    expect(refused(withCandidate({ email: 'not-an-email' }))).toBe(true);
    expect(refused(withCandidate({ phone: 'call me' }))).toBe(true);
    expect(refused(withCandidate({ linkedinUrl: 'javascript:alert(1)' }))).toBe(true);
  });

  it('refuses an application pointing at a stage of another job', () => {
    const result = parseMigrationPackage(withApplication({ stageRef: 'nope' }));
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('applications');
  });

  it.each([
    ['a missing candidate', withApplication({ candidateRef: 'c9' }), ['applications', 0, 'candidateRef'], 'unknown_candidate'],
    ['a missing job', withApplication({ jobRef: 'j9' }), ['applications', 0, 'jobRef'], 'unknown_job'],
    ['a missing stage', withApplication({ stageRef: 's9' }), ['applications', 0, 'stageRef'], 'unknown_stage'],
    [
      'a history stage of another job',
      withApplication({ stageHistory: [{ stageRef: 's9', enteredAt: '2025-01-20T09:00:00Z' }] }),
      ['applications', 0, 'stageHistory', 0, 'stageRef'],
      'unknown_stage',
    ],
    ['a note on a missing candidate', withNote({ candidateRef: 'c9' }), ['notes', 0, 'candidateRef'], 'unknown_candidate'],
    ['a note on a missing application', withNote({ applicationRef: 'a9' }), ['notes', 0, 'applicationRef'], 'unknown_application'],
    ['a note by a missing user', withNote({ authorRef: 'u9' }), ['notes', 0, 'authorRef'], 'unknown_user'],
    [
      'a message on a missing application',
      { ...minimal, messages: [{ applicationRef: 'a9', direction: 'inbound', at: '2025-02-01T09:00:00Z', body: 'x' }] },
      ['messages', 0, 'applicationRef'],
      'unknown_application',
    ],
  ])('refuses %s with the path in the issue', (_what, input, path, message) => {
    const issues = parseMigrationPackage(input).error?.issues ?? [];
    expect(issues).toContainEqual(expect.objectContaining({ path, message }));
  });

  it('refuses a note whose application belongs to another candidate', () => {
    const other = { ...candidate, ref: 'c2', email: 'b@example.com' };
    const input = { ...minimal, candidates: [candidate, other], notes: [{ ...note, candidateRef: 'c2' }] };
    expect(issuesOf(input)).toContain('application_of_another_candidate');
  });

  it.each([
    ['users', { ...minimal, users: [minimal.users[0], minimal.users[0]] }],
    ['jobs', { ...minimal, jobs: [job, job] }],
    ['stages', withJob({ stages: [job.stages[0], job.stages[0]] })],
    ['candidates', { ...minimal, candidates: [candidate, candidate] }],
    ['applications', { ...minimal, applications: [application, application] }],
  ])('refuses duplicate refs in %s', (_collection, input) => {
    expect(issuesOf(input)).toContain('duplicate_ref');
  });

  it.each([
    ['outside files/', 'docs/cv.pdf'],
    ['with ..', 'files/../migration.json'],
    ['absolute', '/files/cv.pdf'],
    ['with a backslash', 'files\\cv.pdf'],
    ['with an empty segment', 'files//cv.pdf'],
    ['the folder itself', 'files/'],
  ])('refuses a file path %s', (_why, path) => {
    const input = withApplication({ files: [{ path, kind: 'cv', fileName: 'cv.pdf' }] });
    expect(issuesOf(input)).toContain('invalid_file_path');
  });

  it('refuses the same file twice and two CVs on one application', () => {
    const cv = application.files[0]!;
    expect(issuesOf(withApplication({ files: [cv, cv] }))).toContain('duplicate_file');
    expect(issuesOf(withApplication({ files: [cv, { ...cv, path: 'files/a1/cv2.pdf' }] }))).toContain('more_than_one_cv');
  });

  it('refuses dates out of order', () => {
    expect(issuesOf(withJob({ closedAt: '2024-01-01T00:00:00Z' }))).toContain('closed_before_created');
    expect(issuesOf(withApplication({ closedAt: '2024-01-01T00:00:00Z' }))).toContain('closed_before_created');
    expect(issuesOf(withCandidate({ consent: { givenAt: '2025-01-12T09:00:00Z', expiresAt: '2025-01-01T09:00:00Z' } }))).toContain(
      'expires_before_given',
    );
  });

  it('requires an outcome and a closing date together', () => {
    expect(issuesOf(withApplication({ closedAt: undefined }))).toContain('outcome_requires_closed_at');
    expect(issuesOf(withApplication({ outcome: undefined }))).toContain('closed_at_requires_outcome');
    expect(refused(withApplication({ outcome: undefined, closedAt: undefined }))).toBe(false);
  });

  it('refuses a closing date on a job that is not closed', () => {
    expect(issuesOf(withJob({ status: 'open' }))).toContain('closed_at_requires_closed_status');
    expect(refused(withJob({ status: 'open', closedAt: undefined }))).toBe(false);
  });

  it('caps the collections', () => {
    expect(MIGRATION_LIMITS.candidates).toBeGreaterThanOrEqual(50_000);
    expect(MIGRATION_LIMITS.totalBytes).toBe(1024 ** 3);
    const many = Array.from({ length: MIGRATION_LIMITS.jobs + 1 }, (_, index) => ({ ...job, ref: `j${index}` }));
    expect(issuesOf({ ...minimal, jobs: many })).toContain('too_big');
  });

  it('caps the number of files across the package', () => {
    const files = Array.from({ length: MIGRATION_LIMITS.filesPerApplication }, (_, index) => ({
      path: `files/a/${index}.pdf`,
      kind: 'other',
      fileName: `${index}.pdf`,
    }));
    const count = Math.ceil((MIGRATION_LIMITS.files + 1) / files.length);
    const applications = Array.from({ length: count }, (_, index) => ({
      ...application,
      ref: `a${index}`,
      files: files.map((file) => ({ ...file, path: `files/${index}/${file.fileName}` })),
    }));
    expect(issuesOf({ ...minimal, applications, notes: [] })).toContain('too_many_files');
  });
});

describe('isMigrationFilePath', () => {
  it('accepts nested paths under files/', () => {
    expect(isMigrationFilePath('files/a1/cv.pdf')).toBe(true);
    expect(isMigrationFilePath('files/cv.pdf')).toBe(true);
    expect(isMigrationFilePath('files/./cv.pdf')).toBe(false);
    expect(isMigrationFilePath('files/a\u0000.pdf')).toBe(false);
  });
});

describe('migrationPackageJsonSchema', () => {
  it('is versioned, deterministic and closed to unknown fields', () => {
    const schema = migrationPackageJsonSchema();
    expect(schema.$id).toBe(MIGRATION_PACKAGE_SCHEMA_ID);
    expect(schema).toHaveProperty('additionalProperties', false);
    expect(schema).toHaveProperty('properties.candidates.items.additionalProperties', false);
    expect(JSON.stringify(migrationPackageJsonSchema())).toBe(JSON.stringify(schema));
  });
});
