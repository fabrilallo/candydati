import type { FixtureResource } from './responses.js';

/** Shape of a generated account. Every value is synthetic: no real name, email or document. */
export interface LargeAccountSize {
  readonly candidates: number;
  readonly jobs: number;
  /** Every n-th candidate has a CV, and every 2n-th an upload. */
  readonly fileEvery: number;
}

export interface LargeAccount {
  readonly users: FixtureResource[];
  readonly jobs: FixtureResource[];
  readonly stagesOf: (jobId: string) => FixtureResource[];
  readonly rejectReasons: FixtureResource[];
  readonly questions: FixtureResource[];
  readonly applications: FixtureResource[];
  readonly answers: FixtureResource[];
  readonly candidates: (fileBase: string) => FixtureResource[];
  readonly uploads: (fileBase: string) => FixtureResource[];
  readonly notes: FixtureResource[];
}

const link = (type: string, id: string) => ({ data: { id, type } });
const STAGES = [
  ['Inbox', 'Inbox'],
  ['Screening', 'In process'],
  ['Hired', 'Hired'],
] as const;

/**
 * A Teamtailor-like account of any size, in the docs' record shapes (see `responses.ts`). Candidate `i` applies to job
 * `i mod jobs`; every third one to a second job as well; every fifth is rejected; one in three has a note.
 */
export function generateAccount(size: LargeAccountSize): LargeAccount {
  const jobIds = Array.from({ length: size.jobs }, (_, index) => `j${index}`);
  const stagesOf = (jobId: string): FixtureResource[] =>
    STAGES.map(([name, type], index) => ({ id: `${jobId}-s${index}`, type: 'stages', attributes: { name, 'stage-type': type, 'row-order': index * 100 } }));
  const applications: FixtureResource[] = [];
  const answers: FixtureResource[] = [];
  const notes: FixtureResource[] = [];
  const application = (id: string, candidate: number, job: string, rejected: boolean): FixtureResource => ({
    id,
    type: 'job-applications',
    attributes: { 'created-at': '2024-03-01T10:00:00.000+01:00', 'changed-stage-at': '2024-03-05T10:00:00.000+01:00', 'cover-letter': `Synthetic cover letter ${candidate}`, sourced: false, ...(rejected ? { 'rejected-at': '2024-04-01T10:00:00.000+01:00' } : {}) },
    relationships: { candidate: link('candidates', `c${candidate}`), job: link('jobs', job), stage: link('stages', `${job}-s${rejected ? 0 : 1}`), ...(rejected ? { 'reject-reason': link('reject-reasons', '1') } : {}) },
  });
  for (let index = 0; index < size.candidates; index += 1) {
    applications.push(application(`a${index}`, index, jobIds[index % size.jobs] ?? 'j0', index % 5 === 0));
    if (index % 3 === 0) applications.push(application(`b${index}`, index, jobIds[(index + 1) % size.jobs] ?? 'j0', false));
    answers.push({ id: `an${index}`, type: 'answers', attributes: { text: `Synthetic answer ${index}` }, relationships: { question: link('questions', 'q1'), candidate: link('candidates', `c${index}`) } });
    if (index % 3 === 1) notes.push({ id: `n${index}`, type: 'notes', attributes: { note: `Synthetic note ${index}`, 'user-id': 'u1', 'candidate-id': `c${index}`, 'created-at': '2024-03-10T10:00:00.000+01:00' } });
  }
  return {
    users: [{ id: 'u1', type: 'users', attributes: { name: 'Synthetic Recruiter', email: 'recruiter@example.test' } }],
    jobs: jobIds.map((id, index) => ({ id, type: 'jobs', attributes: { title: `Synthetic role ${index}`, status: index % 4 === 0 ? 'archived' : 'open', 'created-at': '2023-01-01T00:00:00.000+01:00' } })),
    stagesOf,
    rejectReasons: [{ id: '1', type: 'reject-reasons', attributes: { reason: 'Synthetic', 'rejected-by-company': true } }],
    questions: [{ id: 'q1', type: 'questions', attributes: { title: 'Synthetic question' } }],
    applications,
    answers,
    notes,
    candidates: (fileBase) =>
      Array.from({ length: size.candidates }, (_, index) => ({
        id: `c${index}`,
        type: 'candidates',
        attributes: { 'first-name': `Name${index}`, 'last-name': `Family${index}`, email: `candidate-${index}@example.test`, 'created-at': '2022-05-01T10:00:00.000+02:00', resume: index % size.fileEvery === 0 ? `${fileBase}/files/resume.pdf` : null },
      })),
    uploads: (fileBase) =>
      Array.from({ length: Math.floor(size.candidates / (size.fileEvery * 2)) }, (_, index) => ({
        id: `up${index}`,
        type: 'uploads',
        attributes: { url: `${fileBase}/files/cover_letter.pdf`, 'file-name': `letter-${index}.pdf` },
        relationships: { candidate: link('candidates', `c${index * size.fileEvery * 2}`) },
      })),
  };
}
