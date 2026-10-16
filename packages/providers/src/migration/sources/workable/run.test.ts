import { parseMigrationPackage } from '@candydati/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { exampleActivities, exampleCandidate, workableAccount } from '../../../testing/workable-account.js';
import { startWorkable, workableBuilder, type WorkableHarness } from '../../../testing/workable-harness.js';
import { createWorkableClient } from './client.js';
import { importWorkable } from './run.js';

let harness: Promise<WorkableHarness> | undefined;
afterEach(async () => {
  await (await harness)?.close();
  harness = undefined;
});

const TOKEN = 'wk_test_token_123456';
const PDF = new TextEncoder().encode('%PDF-1.4 fake cv');
const NOW = new Date('2026-10-16T10:00:00Z');

/** Candidate A: the docs' example candidate with a CV, tags, answers (shape from the create-candidate docs) and fields the package refuses. */
const candidateA = (origin: string) =>
  exampleCandidate({
    resume_url: `${origin}/files/cv.pdf`,
    resume_metadata: { filename: 'cindy-sawyers.pdf' },
    tags: ['remote', 'senior'],
    cover_letter: '<p>Dear team,</p><p>I am applying.</p>',
    answers: [
      { question: { body: 'Explain one aspect of this role you believe you will excel at.' }, answer: { body: '<p>Planning</p>' } },
      { question: { body: 'How many years administrative experience do you have?' }, answer: { choices: [{ body: 'Over 5 years' }] } },
    ],
    ratings: [{ member: 'x', score: 5, comment: 'SECRET-RATING' }],
    scorecards: [{ total: 4 }],
    image_url: 'https://example.com/photo-of-candidate.jpg',
  });

/** Candidate B: listed in the docs' candidate list; withdrew after the interview. Its CV link answers 404. */
const candidateB = (origin: string) =>
  exampleCandidate({ id: 'ce4da98', name: 'Lakita Marrero', firstname: 'Lakita', lastname: 'Marrero', email: 'lakita_marrero@gmail.com', stage: 'Interview', stage_kind: 'interview', disqualified: true, withdrew: true, disqualified_at: '2015-07-07T10:00:00Z', disqualification_reason: 'Found another job', domain: 'twitter.com', sourced: true, resume_url: `${origin}/files/missing.pdf`, tags: [], answers: [], cover_letter: null, education_entries: [], experience_entries: [] });

const activitiesOfA = () => [
  ...exampleActivities(),
  { action: 'comment', stage_name: null, created_at: '2016-10-04T00:00:00.000Z', member: { id: '3dae6411', name: 'John Doe' }, body: 'Second opinion: <b>strong</b> communicator' },
  { action: 'message', stage_name: null, created_at: '2016-10-05T00:00:00.000Z', member: { id: '3dae6411', name: 'John Doe' }, body: '<p>Welcome aboard</p>' },
  { action: 'rating', stage_name: null, created_at: '2016-10-06T00:00:00.000Z', member: { id: '3dae6411', name: 'John Doe' }, body: 'SECRET-RATING', rating: { score: 5 } },
];

const activitiesOfB = () => [
  { action: 'applied', stage_name: 'Applied', created_at: '2015-07-01T00:00:00.000Z', body: null },
  { action: 'move', stage_name: 'Applied', action_stage: { id: 1, name: 'Applied' }, target_stage: { id: 4, name: 'Interview' }, created_at: '2015-07-03T00:00:00.000Z', member: { id: '3dae6411', name: 'John Doe' }, body: null },
  { action: 'disqualification', stage_name: null, created_at: '2015-07-07T10:00:00.000Z', member: { id: '3dae6411', name: 'John Doe' }, body: 'The candidate withdrew' },
];

const run = (extra: { readonly files?: boolean } = {}) =>
  (harness = startWorkable((origin) =>
    workableAccount({
      candidates: { '108d1748': candidateA(origin), ce4da98: candidateB(origin) },
      activities: { '108d1748': activitiesOfA(), ce4da98: activitiesOfB() },
      files: extra.files === false ? {} : { '/files/cv.pdf': { raw: PDF } },
    }),
  ));

describe('importWorkable', () => {
  it('reads an account into a package the schema accepts, with CVs, history, notes, messages and outcomes', async () => {
    const server = await run();
    const { builder, manifest, keys } = workableBuilder();
    const progress: unknown[] = [];
    const client = createWorkableClient(server.reader, server.baseUrl, TOKEN);
    const stats = await importWorkable(client, builder, async (done, total) => { progress.push([done, total]); }, NOW);

    const parsed = parseMigrationPackage(manifest());
    if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
    const pkg = parsed.data;

    expect(stats).toEqual({ users: 1, jobs: 3, candidates: 2, files: 1, skippedCandidates: 0, skippedFiles: 1 });
    expect(pkg.users).toEqual([{ ref: '3dae6411', name: 'John Doe', email: 'john.doe@workable.com' }]);
    expect(pkg.jobs.map((job) => [job.ref, job.status])).toEqual([['GROOV003', 'draft'], ['GROOV001', 'closed'], ['GROOV005', 'open']]);
    expect(pkg.jobs[0]?.stages.map((stage) => [stage.ref, stage.type])).toEqual([['sourced', undefined], ['applied', undefined], ['phone-screen', 'screening_call'], ['interview', undefined], ['offer', 'offer'], ['hired', undefined]]);

    const a = pkg.applications.find((application) => application.ref === '108d1748');
    expect(a).toMatchObject({ jobRef: 'GROOV005', stageRef: 'applied', origin: 'twitter.com', coverLetter: 'Dear team,\nI am applying.' });
    expect(a?.outcome).toBeUndefined();
    expect(a?.stageHistory).toEqual([{ stageRef: 'applied', enteredAt: '2016-09-29T00:00:00.000Z' }, { stageRef: 'phone-screen', enteredAt: '2016-10-02T00:00:00.000Z' }]);
    expect(a?.answers).toEqual([
      { question: 'Explain one aspect of this role you believe you will excel at.', answer: 'Planning' },
      { question: 'How many years administrative experience do you have?', answer: 'Over 5 years' },
    ]);
    expect(a?.files).toEqual([{ path: expect.stringMatching(/^files\/1\/cindy-sawyers\.pdf$/), kind: 'cv', fileName: 'cindy-sawyers.pdf' }]);

    const b = pkg.applications.find((application) => application.ref === 'ce4da98');
    expect(b).toMatchObject({ stageRef: 'interview', outcome: 'withdrawn', closedAt: '2015-07-07T10:00:00.000Z', origin: 'sourced', files: [] });
    expect(b?.stageHistory).toEqual([{ stageRef: 'applied', enteredAt: '2015-07-01T00:00:00.000Z' }, { stageRef: 'interview', enteredAt: '2015-07-03T00:00:00.000Z' }]);

    expect(pkg.candidates.find((c) => c.ref === '108d1748')).toMatchObject({ firstName: 'Cindy', lastName: 'Sawyers', email: 'cindy_sawyers@gmail.com', phone: '(785)991-6256', linkedinUrl: 'http://www.linkedin.com/in/cindy_sawyers', tags: ['remote', 'senior'], createdAt: '2015-07-01T00:00:00.000Z' });
    expect(pkg.candidates.find((c) => c.ref === '108d1748')?.consent).toBeUndefined();

    const notesOfA = pkg.notes.filter((note) => note.candidateRef === '108d1748');
    expect(notesOfA).toEqual([
      { candidateRef: '108d1748', applicationRef: '108d1748', authorName: 'Eduardo Vallente', body: 'Sure, looks very promising. Let’s schedule a phone interview', createdAt: '2016-10-01T00:00:00.000Z' },
      { candidateRef: '108d1748', applicationRef: '108d1748', authorRef: '3dae6411', body: 'Second opinion: strong communicator', createdAt: '2016-10-04T00:00:00.000Z' },
    ]);
    expect(pkg.notes.find((note) => note.candidateRef === 'ce4da98')).toMatchObject({ authorRef: '3dae6411', body: 'Disqualified: The candidate withdrew' });
    expect(pkg.messages).toEqual([
      expect.objectContaining({ applicationRef: '108d1748', direction: 'inbound', at: '2016-10-03T00:00:00.000Z', from: 'cindy_sawyers@gmail.com' }),
      expect.objectContaining({ applicationRef: '108d1748', direction: 'outbound', from: 'john.doe@workable.com', to: 'cindy_sawyers@gmail.com', body: 'Welcome aboard' }),
    ]);
    expect(keys()).toHaveLength(1);
    expect(progress[0]).toEqual([0, null]);
    expect(progress.at(-1)).toEqual([2, null]);
  });

  it('never carries what the package refuses: ratings, scorecards, photos, education, experience, address', async () => {
    const server = await run();
    const { builder, manifest } = workableBuilder();
    await importWorkable(createWorkableClient(server.reader, server.baseUrl, TOKEN), builder, async () => undefined, NOW);
    const json = JSON.stringify(manifest());
    for (const forbidden of ['SECRET-RATING', '"ratings"', '"scorecards"', '"rating"', 'photo-of-candidate', 'image_url', 'education', 'University of Chicago', '"experience', 'Overflow Furnishings', 'Clemmie Roads', '"skills"', '"summary"', 'outbound_mailbox']) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('downloads each CV right after reading its record, before the next candidate', async () => {
    const server = await run();
    const { builder } = workableBuilder();
    await importWorkable(createWorkableClient(server.reader, server.baseUrl, TOKEN), builder, async () => undefined, NOW);
    const order = server.requests.map((request) => request.url.pathname.replace('/spi/v3', '')).filter((path) => path.startsWith('/candidates/') || path.startsWith('/files/'));
    expect(order).toEqual(['/candidates/ce4da98', '/files/missing.pdf', '/candidates/ce4da98/activities', '/candidates/108d1748', '/files/cv.pdf', '/candidates/108d1748/activities']);
  });
});
