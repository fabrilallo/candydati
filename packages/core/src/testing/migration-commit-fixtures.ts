import { migrationPackageKey, type MigrationBatch, type MigrationPackageInput } from '@candydati/domain';
import type { MigrationPackageOpenResult } from '../migration-ports.js';
import { analyzeMigration } from '../use-cases/migrations/analyze-migration.js';
import { updateMigrationChoices } from '../use-cases/migrations/choices.js';
import { createMigrationFromPackage } from '../use-cases/migrations/create-migration.js';
import { requestMigrationCommit } from '../use-cases/migrations/request-commit.js';
import { ORG_A } from './candidate-seed.js';
import { fakePdfBytes } from './candidate-fixtures.js';
import { migrationOwner, openedPackage, zipBytes } from './migration-fixtures.js';
import type { TestMigrationCommitDeps } from './migration-deps.js';

export const DECLARATIONS = { controller: true, previewChecked: true, processorsOwned: true } as const;

const T = (date: string): string => `${date}T09:00:00Z`;

/**
 * Three jobs (one left out by the operator), five people: Ada already known by email, Bruno whose retention expired,
 * Carla with no consent date and two applications, Dario with no email, Elena only in the job left out. CVs, a file
 * that is not a CV, an attachment, notes by a member, by an outside author and by a bare name, two past emails.
 */
export const COMMIT_PACKAGE: MigrationPackageInput = {
  format: 'candydati-migration',
  version: 1,
  source: { system: 'teamtailor', exportedAt: T('2026-05-01'), producer: 'connector:teamtailor@1' },
  users: [
    { ref: 'u1', name: 'Olivia O.', email: 'OLIVIA@acme.example' },
    { ref: 'u2', name: 'Giulia Rossi', email: 'giulia@old-ats.example' },
  ],
  jobs: [
    {
      ref: 'j1',
      title: 'Backend Developer',
      status: 'closed',
      createdAt: T('2025-01-10'),
      closedAt: T('2025-06-01'),
      content: { summary: 'APIs' },
      stages: [
        { ref: 's1', name: 'Applied' },
        { ref: 's2', name: 'Phone screen', type: 'screening_call' },
        { ref: 's3', name: 'Second call', type: 'screening_call' },
        { ref: 's4', name: 'Offer', type: 'offer' },
      ],
    },
    { ref: 'j2', title: 'Designer', status: 'open', createdAt: T('2026-01-10'), stages: [{ ref: 's1', name: 'Applied' }, { ref: 's2', name: 'Colloquio tecnico' }] },
    { ref: 'j3', title: 'Left behind', status: 'draft', createdAt: T('2026-01-10'), stages: [{ ref: 's1', name: 'Applied' }] },
  ],
  candidates: [
    { ref: 'c1', firstName: 'Ada', lastName: 'Bianchi', email: 'ADA@example.com', phone: '+39 347 000 1111', createdAt: T('2025-01-12'), consent: { givenAt: T('2025-01-12'), scopes: ['selection', 'talent_pool'] } },
    { ref: 'c2', firstName: 'Bruno', lastName: 'Verdi', email: 'bruno@example.com', createdAt: T('2020-01-12'), consent: { givenAt: T('2020-01-12') } },
    { ref: 'c3', firstName: 'Carla', lastName: 'Neri', email: 'carla@example.com', createdAt: T('2025-01-20'), tags: ['design'] },
    { ref: 'c4', firstName: 'Dario', lastName: 'Sala', createdAt: T('2025-01-21'), consent: { givenAt: T('2026-01-12') } },
    { ref: 'c5', firstName: 'Elena', lastName: 'Riva', email: 'elena@example.com', createdAt: T('2026-01-12'), consent: { givenAt: T('2026-01-12') } },
  ],
  applications: [
    {
      ref: 'a1',
      candidateRef: 'c1',
      jobRef: 'j1',
      stageRef: 's4',
      createdAt: T('2025-02-01'),
      outcome: 'hired',
      closedAt: T('2025-04-01'),
      origin: 'LinkedIn',
      files: [{ path: 'files/a1/cv.pdf', kind: 'cv', fileName: 'ada-cv.pdf' }],
      stageHistory: [
        { stageRef: 's1', enteredAt: T('2025-02-01') },
        { stageRef: 's3', enteredAt: T('2025-02-10') },
        { stageRef: 's2', enteredAt: T('2025-02-11') },
        { stageRef: 's4', enteredAt: T('2025-03-01') },
      ],
    },
    { ref: 'a2', candidateRef: 'c2', jobRef: 'j1', stageRef: 's2', createdAt: T('2020-01-12') },
    {
      ref: 'a3',
      candidateRef: 'c3',
      jobRef: 'j2',
      stageRef: 's2',
      createdAt: T('2026-01-20'),
      coverLetter: 'Vorrei lavorare con voi.',
      files: [
        { path: 'files/a3/cv.txt', kind: 'cv', fileName: 'cv.txt' },
        { path: 'files/a3/portfolio.pdf', kind: 'other', fileName: 'portfolio.pdf' },
      ],
      stageHistory: [
        { stageRef: 's1', enteredAt: T('2026-01-20') },
        { stageRef: 's2', enteredAt: T('2026-02-01') },
      ],
    },
    { ref: 'a4', candidateRef: 'c4', jobRef: 'j1', stageRef: 's2', createdAt: T('2025-01-21'), outcome: 'not_selected', closedAt: T('2025-03-01') },
    { ref: 'a5', candidateRef: 'c5', jobRef: 'j3', stageRef: 's1', createdAt: T('2026-01-12') },
    { ref: 'a6', candidateRef: 'c3', jobRef: 'j1', stageRef: 's1', createdAt: T('2025-01-20'), outcome: 'withdrawn', closedAt: T('2025-02-05') },
  ],
  notes: [
    { candidateRef: 'c1', applicationRef: 'a1', authorRef: 'u1', body: 'Ottimo colloquio', createdAt: T('2025-03-02') },
    { candidateRef: 'c3', authorRef: 'u2', body: 'Portfolio interessante', createdAt: T('2026-02-02') },
    { candidateRef: 'c4', applicationRef: 'a4', authorName: 'Ex recruiter', body: 'Non disponibile', createdAt: T('2025-02-20') },
    { candidateRef: 'c2', body: 'Expired person', createdAt: T('2020-02-20') },
    { candidateRef: 'c1', authorRef: 'u2', body: 'Already known to us', createdAt: T('2025-01-13') },
  ],
  messages: [
    { applicationRef: 'a1', direction: 'outbound', at: T('2025-03-05'), subject: 'Offerta', body: 'Ecco la nostra offerta' },
    { applicationRef: 'a3', direction: 'inbound', at: T('2026-02-03'), body: 'Grazie!' },
    { applicationRef: 'a5', direction: 'outbound', at: T('2026-02-03'), body: 'Left behind' },
  ],
};

export const COMMIT_FILES = (): Record<string, Uint8Array> => ({
  'files/a1/cv.pdf': fakePdfBytes(),
  'files/a3/cv.txt': new TextEncoder().encode('plain text'),
  'files/a3/portfolio.pdf': fakePdfBytes(),
});

/** Ada's form answers in ATTACHMENTS_PACKAGE. */
export const ADA_ANSWERS = [
  { question: 'Periodo di preavviso?', answer: 'Un mese' },
  { question: 'Disponibile a trasferte?', answer: 'Sì, occasionali' },
] as const;

/**
 * COMMIT_PACKAGE with Ada's application carrying, besides her CV, a cover letter, a scanned image, a forbidden
 * executable, a file the package does not contain, and her form answers.
 */
export const ATTACHMENTS_PACKAGE: MigrationPackageInput = {
  ...COMMIT_PACKAGE,
  applications: COMMIT_PACKAGE.applications.map((application) =>
    application.ref === 'a1'
      ? {
          ...application,
          answers: [...ADA_ANSWERS],
          files: [
            ...(application.files ?? []),
            { path: 'files/a1/letter.pdf', kind: 'cover_letter', fileName: 'Lettera di presentazione.pdf' },
            { path: 'files/a1/scan.png', kind: 'other', fileName: 'certificato.png' },
            { path: 'files/a1/tool.exe', kind: 'other', fileName: 'portfolio.pdf' },
            { path: 'files/a1/gone.pdf', kind: 'other', fileName: 'gone.pdf' },
          ],
        }
      : application,
  ),
};

/** A PNG signature and a few bytes: enough for the sniffers. */
export const pngBytes = (): Uint8Array => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
/** A Windows executable header. */
export const exeBytes = (): Uint8Array => Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]);

export const ATTACHMENTS_FILES = (): Record<string, Uint8Array> => ({
  ...COMMIT_FILES(),
  'files/a1/letter.pdf': fakePdfBytes(),
  'files/a1/scan.png': pngBytes(),
  'files/a1/tool.exe': exeBytes(),
});

/** The operator's choices for COMMIT_PACKAGE: `Applied` lands in received, s2 and s3 of j1 merge, j3 stays out. */
export const COMMIT_CHOICES = {
  stageNames: [{ name: 'Applied', type: 'received' as const }],
  stageMapping: [{ jobRef: 'j1', stageRef: 's3', type: 'screening_call' as const, title: 'Phone screen' }],
  excludedJobs: ['j3'],
};

export type CommitChoices = Partial<typeof COMMIT_CHOICES>;

/** Uploads and analyses `result` like the worker, then makes the operator's `choices`. */
export async function readyMigration(
  deps: TestMigrationCommitDeps,
  result: MigrationPackageOpenResult = openedPackage(COMMIT_PACKAGE, COMMIT_FILES()),
  choices: CommitChoices = COMMIT_CHOICES,
): Promise<MigrationBatch> {
  const created = await createMigrationFromPackage(deps, migrationOwner, { file: { fileName: 'export.zip', bytes: zipBytes() } });
  deps.packages.register(migrationPackageKey(ORG_A, created.id), result);
  await analyzeMigration(deps, { organizationId: ORG_A, batchId: created.id });
  return updateMigrationChoices(deps, migrationOwner, { migrationId: created.id, ...choices });
}

/** A ready migration confirmed by the owner: `importing`, with `migration.commit` queued. */
export async function confirmedMigration(deps: TestMigrationCommitDeps, result?: MigrationPackageOpenResult, choices?: CommitChoices): Promise<MigrationBatch> {
  const ready = await readyMigration(deps, result, choices);
  return requestMigrationCommit(deps, migrationOwner, { migrationId: ready.id, declarations: DECLARATIONS });
}
