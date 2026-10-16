import { describe, expect, it } from 'vitest';
import { CV_MAX_BYTES } from '../candidate/application.js';
import { analyzeMigrationPackage, type MigrationAnalysisInput, type MigrationFileFacts } from './analysis.js';
import { parseMigrationPackage, type MigrationPackage, type MigrationPackageInput } from './package.js';

const NOW = new Date('2026-10-16T00:00:00Z');
const NOTICE = { retentionDays: { selection: 365, talent_pool: 730 } };

const person = (ref: string, email: string | undefined, consent?: { givenAt: string; expiresAt?: string }) => ({
  ref,
  firstName: 'Ada',
  lastName: 'Bianchi',
  ...(email === undefined ? {} : { email }),
  createdAt: '2025-01-12T09:00:00Z',
  ...(consent ? { consent } : {}),
});

const application = (ref: string, candidateRef: string, jobRef: string, stageRef: string, extra: Record<string, unknown> = {}) => ({
  ref,
  candidateRef,
  jobRef,
  stageRef,
  createdAt: '2026-01-12T09:00:00Z',
  ...extra,
});

const closed = (outcome: string) => ({ outcome, closedAt: '2026-02-01T09:00:00Z' });

const base: MigrationPackageInput = {
  format: 'candydati-migration',
  version: 1,
  source: { system: 'teamtailor', exportedAt: '2026-10-01T10:00:00Z', producer: 'connector:teamtailor@1' },
  jobs: [
    {
      ref: 'j1',
      title: 'Backend Developer',
      status: 'closed',
      createdAt: '2025-01-10T09:00:00Z',
      closedAt: '2026-03-01T09:00:00Z',
      stages: [
        { ref: 's1', name: 'Colloquio HR', type: 'hr_interview' },
        { ref: 's2', name: 'Applied' },
      ],
    },
    { ref: 'j2', title: 'Designer', status: 'open', createdAt: '2026-01-10T09:00:00Z', stages: [{ ref: 's1', name: 'Portfolio review' }] },
  ],
  candidates: [
    person('c1', 'ada@example.com', { givenAt: '2026-01-12T09:00:00Z' }),
    person('c2', 'Old@Example.com', { givenAt: '2020-01-12T09:00:00Z', expiresAt: '2021-01-12T09:00:00Z' }),
    person('c3', 'new@example.com'),
    person('c4', undefined),
    person('c5', 'ADA@example.com'),
  ],
  applications: [
    application('a1', 'c1', 'j1', 's1', { ...closed('hired'), files: [{ path: 'files/a1/cv.pdf', kind: 'cv', fileName: 'cv.pdf' }] }),
    application('a2', 'c2', 'j1', 's1', { files: [{ path: 'files/a2/cv.pdf', kind: 'cv', fileName: 'cv.pdf' }] }),
    application('a3', 'c3', 'j1', 's2', { ...closed('not_selected'), files: [{ path: 'files/a3/cv.pdf', kind: 'cv', fileName: 'cv.pdf' }, { path: 'files/a3/big.pdf', kind: 'other', fileName: 'big.pdf' }] }),
    application('a4', 'c3', 'j2', 's1', closed('withdrawn')),
    application('a5', 'c1', 'j2', 's1'),
    application('a6', 'c5', 'j2', 's1', { files: [{ path: 'files/a6/photo.jpg', kind: 'cv', fileName: 'photo.jpg' }] }),
  ],
  notes: [
    { candidateRef: 'c1', body: 'Ottimo', createdAt: '2026-01-20T09:00:00Z' },
    { candidateRef: 'c2', body: 'Vecchia nota', createdAt: '2020-02-20T09:00:00Z' },
  ],
  messages: [
    { applicationRef: 'a1', direction: 'outbound', at: '2026-01-13T09:00:00Z', body: 'Grazie' },
    { applicationRef: 'a2', direction: 'inbound', at: '2020-01-13T09:00:00Z', body: 'Ciao' },
  ],
};

function manifestOf(input: MigrationPackageInput): MigrationPackage {
  const parsed = parseMigrationPackage(input);
  if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
  return parsed.data;
}

const facts = (entries: Record<string, MigrationFileFacts>): ReadonlyMap<string, MigrationFileFacts> => new Map(Object.entries(entries));

const input = (overrides: Partial<MigrationAnalysisInput> = {}): MigrationAnalysisInput => ({
  manifest: manifestOf(base),
  now: NOW,
  notice: NOTICE,
  existingEmails: new Set(['ada@example.com']),
  files: facts({
    'files/a1/cv.pdf': { size: 1000, cvLike: true },
    'files/a2/cv.pdf': { size: 1000, cvLike: true },
    'files/a3/cv.pdf': { size: 1000, cvLike: true },
    'files/a3/big.pdf': { size: CV_MAX_BYTES + 1, cvLike: null },
    'files/a6/photo.jpg': { size: 500, cvLike: false },
  }),
  unreferenced: ['files/stray.txt'],
  ...overrides,
});

const codes = (analysis: ReturnType<typeof analyzeMigrationPackage>) => analysis.issues.map((issue) => `${issue.level}:${issue.code}:${issue.ref ?? ''}`);

describe('analyzeMigrationPackage: people and consent', () => {
  it('buckets consent and leaves out people whose retention expired, with everything hanging from them', () => {
    const { counts, issues } = analyzeMigrationPackage(input());
    expect(counts).toMatchObject({ candidates: 4, consentGiven: 1, consentToRenew: 3, consentExpired: 1 });
    expect(counts).toMatchObject({ applications: 5, excludedApplications: 1, notes: 1, excludedNotes: 1, messages: 1, excludedMessages: 1 });
    expect(issues).toContainEqual({ level: 'warning', code: 'consent_expired', ref: 'c2', detail: '2021-01-12T09:00:00.000Z' });
    expect(issues).toContainEqual({ level: 'info', code: 'consent_to_renew', ref: null, detail: '3' });
  });

  it('proposes a merge for existing emails (case-insensitive), flags missing and repeated emails', () => {
    const { counts, issues } = analyzeMigrationPackage(input());
    expect(counts.merged).toBe(2);
    expect(issues.filter((issue) => issue.code === 'merge_existing').map((issue) => issue.ref)).toEqual(['c1', 'c5']);
    expect(issues).toContainEqual({ level: 'warning', code: 'no_email', ref: 'c4', detail: null });
    expect(issues).toContainEqual({ level: 'warning', code: 'duplicate_email', ref: 'c5', detail: null });
  });

  it('refuses to go on without an active privacy notice', () => {
    const { issues } = analyzeMigrationPackage(input({ notice: null }));
    expect(issues[0]).toEqual({ level: 'error', code: 'privacy_notice_missing', ref: null, detail: null });
  });
});

describe('analyzeMigrationPackage: applications, stages and files', () => {
  it('flags a second open application of the same person (by email) to the same job', () => {
    expect(codes(analyzeMigrationPackage(input()))).toContain('warning:already_applied:a6');
  });

  it('counts applications per job by outcome', () => {
    const { counts } = analyzeMigrationPackage(input());
    expect(counts.perJob).toEqual([
      { jobRef: 'j1', title: 'Backend Developer', status: 'closed', stages: 2, applications: 2, open: 0, hired: 1, notSelected: 1, withdrawn: 0 },
      { jobRef: 'j2', title: 'Designer', status: 'open', stages: 1, applications: 3, open: 2, hired: 0, notSelected: 0, withdrawn: 1 },
    ]);
    expect(counts.jobs).toBe(2);
  });

  it('proposes a stage mapping and lists the stages it could not name', () => {
    const analysis = analyzeMigrationPackage(input());
    expect(analysis.stageMapping).toEqual([
      { jobRef: 'j1', stageRef: 's1', type: 'hr_interview', title: 'Colloquio HR' },
      { jobRef: 'j1', stageRef: 's2', type: 'other', title: 'Applied' },
      { jobRef: 'j2', stageRef: 's1', type: 'other', title: 'Portfolio review' },
    ]);
    expect(analysis.issues).toContainEqual({ level: 'info', code: 'stage_unmapped', ref: 'j1/s2', detail: 'Applied' });
  });

  it('warns when a job has more stages than a pipeline can hold', () => {
    const stages = Array.from({ length: 11 }, (_, index) => ({ ref: `s${index}`, name: `Step ${index}` }));
    const manifest = manifestOf({ ...base, jobs: [{ ...base.jobs[0], ref: 'j1', stages }, base.jobs[1]] as MigrationPackageInput['jobs'], applications: [], notes: [], messages: [] });
    expect(analyzeMigrationPackage(input({ manifest }))).toMatchObject({ issues: expect.arrayContaining([{ level: 'warning', code: 'too_many_stages', ref: 'j1', detail: '11' }]) });
  });

  it('checks the files of the people who come across: missing, oversize, not a CV, unreferenced', () => {
    const files = new Map(input().files);
    files.delete('files/a1/cv.pdf');
    const analysis = analyzeMigrationPackage(input({ files }));
    const found = codes(analysis);
    expect(found).toEqual(expect.arrayContaining([
      'warning:file_missing:files/a1/cv.pdf',
      'warning:file_too_large:files/a3/big.pdf',
      'warning:file_not_cv:files/a6/photo.jpg',
      'info:file_unreferenced:files/stray.txt',
    ]));
    expect(found).not.toContain('warning:file_missing:files/a2/cv.pdf');
    expect(analysis.counts).toMatchObject({ files: 4, excludedFiles: 1 });
  });

  it('tallies the issues by level', () => {
    const { counts, issues } = analyzeMigrationPackage(input());
    expect(counts.issueErrors + counts.issueWarnings + counts.issueInfos).toBe(issues.length);
    expect(counts.issueErrors).toBe(0);
  });
});
