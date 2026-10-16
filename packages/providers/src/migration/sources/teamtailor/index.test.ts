import { createInMemoryFileStorage } from '@candydati/core/testing';
import { MIGRATION_PACKAGE_FORMAT, parseMigrationPackage } from '@candydati/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as fx from '../../../testing/fixtures/migration/teamtailor/responses.js';
import { startTestApi, testReader, type TestApi } from '../../../testing/migration-test-api.js';
import { JsonReaderError } from '../../../http/index.js';
import { createPackageBuilder } from '../../package-builder.js';
import { createTeamtailorConnector, teamtailorConnector, type TeamtailorReport } from './index.js';

let api: TestApi;
beforeAll(async () => {
  api = await startTestApi();
});
afterAll(() => api.close());

const PDF = new TextEncoder().encode('%PDF-1.4 fixture');
const credentials = { apiKey: 'secret-key-123' };
/** The docs' signed-URL host, resolved to the same local server: not an API host, so files come without credentials. */
const storage = () => api.origin.replace('api.teamtailor.com', 'teamtailor-production.s3.amazonaws.com');

const serveFile = (status: number) => (_req: unknown, res: { writeHead(code: number, headers?: Record<string, string>): { end(body?: Uint8Array): void } }) =>
  void res.writeHead(status, { 'content-type': 'application/pdf' }).end(status === 200 ? PDF : undefined);

beforeEach(() => {
  api.seen.length = 0;
  api.routes.clear();
  api.perPage = 2;
  const r = api.routes;
  r.set('/v1/users', fx.users());
  r.set('/v1/jobs', fx.jobs());
  r.set('/v1/jobs/7199/stages', fx.stagesOf('7199'));
  r.set('/v1/jobs/7200/stages', fx.stagesOf('7200'));
  r.set('/v1/reject-reasons', fx.rejectReasons());
  r.set('/v1/job-applications', fx.applications());
  r.set('/v1/questions', fx.questions());
  r.set('/v1/answers', fx.answers());
  r.set('/v1/candidates', fx.candidates(storage()));
  r.set('/v1/uploads', fx.uploads(storage()));
  r.set('/v1/notes', { raw: fx.notesDocShape(fx.notes()) });
  r.set('/files/resume.pdf', serveFile(200));
  r.set('/files/cover_letter.pdf', serveFile(200));
  for (const missing of ['missing', 'gone', 'orphan']) r.set(`/files/${missing}.pdf`, serveFile(404));
});

async function run() {
  const reports: TeamtailorReport[] = [];
  const connector = createTeamtailorConnector({ baseUrl: `${api.origin}/v1`, onReport: (report) => reports.push(report), now: () => new Date('2026-10-16T10:00:00Z') });
  const files = createInMemoryFileStorage();
  const builder = createPackageBuilder({ files, filePrefix: 'organizations/o/migrations/m/', source: { system: 'teamtailor', producer: 'connector:teamtailor@1', exportedAt: '2026-10-16T10:00:00.000Z' }, reserveFiles: async () => undefined });
  const progress: Array<[number, number | null | undefined]> = [];
  const reader = testReader([...connector.hosts(credentials)] as { exact: string }[]);
  await connector.fetch(credentials, builder, { reader, progress: async (done, total) => void progress.push([done, total]), notice: () => undefined });
  const collected = builder.collected();
  const { files: _files, ...items } = collected;
  return { collected, progress, report: reports[0]!, manifest: { format: MIGRATION_PACKAGE_FORMAT, version: 1, ...items }, files };
}

describe('Teamtailor connector: description', () => {
  it('is a beta api connector with a password key, en and it labels, strict credentials and exact hosts', () => {
    expect(teamtailorConnector).toMatchObject({ id: 'teamtailor', maturity: 'beta', input: 'api', docsUrl: 'https://docs.teamtailor.com/' });
    const [field] = teamtailorConnector.fields;
    expect(field).toMatchObject({ name: 'apiKey', type: 'password', secret: true, howToUrl: expect.stringMatching(/^https:\/\//) });
    expect(field?.label.it).not.toBe('');
    expect(field?.help?.en).not.toBe('');
    expect(teamtailorConnector.credentials.safeParse(credentials).success).toBe(true);
    expect(teamtailorConnector.credentials.safeParse({ ...credentials, extra: 1 }).success).toBe(false);
    expect(teamtailorConnector.credentials.safeParse({ apiKey: 'short' }).success).toBe(false);
    expect(teamtailorConnector.hosts(credentials)).toEqual([{ exact: 'api.teamtailor.com' }]);
    expect(teamtailorConnector.rate).toBeDefined();
  });
});

describe('Teamtailor connector: a full run on the docs fixtures', () => {
  it('builds a package the product accepts', async () => {
    const { manifest, progress } = await run();
    const parsed = parseMigrationPackage(manifest);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(progress.length).toBeGreaterThan(1);
    expect(progress.at(-1)?.[0]).toBeGreaterThan(10);
  });

  it('maps users, jobs (status, stages in row order) and candidates', async () => {
    const { collected } = await run();
    expect(collected.users).toEqual([{ ref: '4468', name: 'Jonas Brusman', email: 'jonas@example.com' }]);
    expect(collected.jobs.map((job) => [job.ref, job.title, job.status, job.stages.map((s) => s.name)])).toEqual([
      ['7199', 'Marketing Manager', 'open', ['Inbox', 'Reviewing', 'Hired']],
      ['7200', 'Developer', 'closed', ['Inbox', 'Reviewing', 'Hired']],
    ]);
    const [john, , jane] = collected.candidates;
    expect(john).toMatchObject({ ref: '1337', firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com', phone: '0700000000', linkedinUrl: 'https://www.linkedin.com/pub/johndoe', tags: ['turtles'], createdAt: '2017-01-18T21:04:56.178+01:00' });
    expect(collected.candidates[1]).not.toHaveProperty('phone');
    expect(jane?.ref).toBe('576');
    for (const candidate of collected.candidates) expect(candidate).not.toHaveProperty('consent');
  });

  it('maps applications: stage, history, origin, cover letter, answers, rejected, withdrawn and hired outcomes', async () => {
    const { collected } = await run();
    const byRef = Object.fromEntries(collected.applications.map((a) => [a.ref, a]));
    expect(byRef['1337']).toMatchObject({ candidateRef: '1337', jobRef: '7199', stageRef: '7199-8', origin: 'Facebook', coverLetter: 'Dear Sir/Madam…', stageHistory: [{ stageRef: '7199-8', enteredAt: '2017-03-01T11:29:48.841+01:00' }] });
    expect(byRef['1337']?.outcome).toBeUndefined();
    expect(byRef['1337']?.answers).toEqual([
      { question: 'Can you describe your ideal work environment?', answer: 'Dear Sir/Madam…' },
      { question: 'Have you ever worked with sales before?', answer: 'yes' },
    ]);
    expect(byRef['1338']).toMatchObject({ outcome: 'not_selected', closedAt: '2015-09-09T11:26:34.025+02:00' });
    expect(byRef['1338']).not.toHaveProperty('coverLetter');
    expect(byRef['1339']).toMatchObject({ outcome: 'withdrawn', origin: 'sourced' });
    expect(byRef['1340']).toMatchObject({ outcome: 'hired', closedAt: '2015-06-01T10:00:00.000+02:00', stageRef: '7200-9' });
    expect(byRef['1340']?.answers).toEqual([]);
  });

  it('downloads CVs and uploads right after reading them, with no credentials sent to the file URL', async () => {
    const { collected, files, report } = await run();
    const john = collected.applications.find((a) => a.ref === '1337');
    expect(john?.files.map((f) => [f.kind, f.fileName])).toEqual([['cv', 'resume.pdf'], ['other', 'cover_letter.pdf']]);
    expect(collected.files.size).toBe(2);
    expect(files.keys().length).toBe(2);
    const downloads = api.seen.filter((req) => req.url?.startsWith('/files/'));
    expect(downloads.length).toBe(4);
    for (const req of downloads) expect(req.headers).not.toHaveProperty('authorization');
    for (const req of downloads) expect(req.headers.host).toBe(new URL(storage()).host);
    expect(report).toMatchObject({ files: 2, filesSkipped: 3 });
  });

  it('skips a failing download and counts it, without stopping the run', async () => {
    const { collected, report } = await run();
    const jane = collected.applications.filter((a) => a.candidateRef === '576');
    expect(jane.every((a) => a.files.length === 0)).toBe(true);
    expect(report.filesSkipped).toBe(3);
    expect(report).toMatchObject({ users: 1, jobs: 2, candidates: 3, applications: 4, applicationsSkipped: 0, notes: 2, notesSkipped: 1, answers: 2 });
  });

  it('maps notes: author known or not, private flag, unknown candidates left out', async () => {
    const { collected } = await run();
    expect(collected.notes).toEqual([
      { candidateRef: '1337', authorRef: '4468', body: 'Example note', createdAt: '2020-07-16T11:31:22.389+02:00' },
      { candidateRef: '1106', body: 'Only for the team', createdAt: '2020-07-17T11:31:22.389+02:00', private: true },
    ]);
  });

  it('never carries ratings, scores, pictures, pitches or the key', async () => {
    api.routes.set('/v1/candidates', fx.candidates(api.origin).map((c) => ({ ...c, attributes: { ...c.attributes, rating: 5, score: 9, nps: 10, gender: 'f', 'birth-date': '1990-01-01' } })));
    const { manifest } = await run();
    const text = JSON.stringify(manifest);
    for (const forbidden of ['picture', 'image.jpg', 'pitch', 'I like turtles', 'rating', 'score', 'nps', 'gender', 'birth', 'secret-key-123', 'partner']) expect(text).not.toContain(forbidden);
    expect(parseMigrationPackage(manifest).success).toBe(true);
  });
});

describe('Teamtailor connector: tolerance and failures', () => {
  it('leaves out applications of unknown jobs or stages, and of candidates not listed', async () => {
    api.routes.set('/v1/job-applications', [
      ...fx.applications(),
      { id: '2000', type: 'job-applications', attributes: { 'created-at': '2016-01-01T00:00:00Z' }, relationships: { candidate: { data: { id: '1337', type: 'candidates' } }, job: { data: { id: '555', type: 'jobs' } }, stage: { data: { id: '1', type: 'stages' } } } },
      { id: '2001', type: 'job-applications', attributes: { 'created-at': '2016-01-01T00:00:00Z' }, relationships: { candidate: { data: { id: '8888', type: 'candidates' } }, job: { data: { id: '7199', type: 'jobs' } }, stage: { data: { id: '7199-5', type: 'stages' } } } },
    ]);
    const { report, manifest } = await run();
    expect(report.applications).toBe(4);
    expect(report.applicationsSkipped).toBe(2);
    expect(parseMigrationPackage(manifest).success).toBe(true);
  });

  it('refuses the run when the API gives no relation ids at all', async () => {
    api.routes.set('/v1/job-applications', fx.applications().map(({ relationships: _r, ...rest }) => rest));
    await expect(run()).rejects.toMatchObject({ code: 'source_invalid_response' });
  });

  it('turns a refused key into credentials_refused', async () => {
    api.routes.set('/v1/users', (_req, res) => void res.writeHead(401).end());
    const error = await run().then(() => undefined, (e: unknown) => e);
    expect(error).toBeInstanceOf(JsonReaderError);
    expect(error).toMatchObject({ code: 'credentials_refused' });
  });

  it('fills what a sparse record lacks: names from the email, a stand-in creation date, bad optional fields dropped', async () => {
    api.routes.set('/v1/candidates', [{ id: '1337', type: 'candidates', attributes: { email: 'ada.lovelace@example.com', phone: 'call me', 'linkedin-url': 'not a url', tags: ['  a ', 'a', ''] } }, { id: '1106', type: 'candidates', attributes: { 'first-name': 'x@y.z', email: 'bad' } }]);
    api.routes.set('/v1/jobs', [{ id: '7199', type: 'jobs', attributes: { title: 'Role', status: 'weird' } }, { id: '7200', type: 'jobs', attributes: { title: '  ' } }]);
    const { collected, manifest } = await run();
    expect(collected.candidates[0]).toMatchObject({ firstName: 'ada.lovelace', lastName: '-', tags: ['a'], createdAt: '2026-10-16T10:00:00.000Z' });
    expect(collected.candidates[0]).not.toHaveProperty('phone');
    expect(collected.candidates[0]).not.toHaveProperty('linkedinUrl');
    expect(collected.candidates[1]).toMatchObject({ firstName: '-', lastName: '-' });
    expect(collected.jobs).toMatchObject([{ ref: '7199', status: 'closed', createdAt: '2026-10-16T10:00:00.000Z' }]);
    expect(parseMigrationPackage(manifest).success).toBe(true);
  });
});
