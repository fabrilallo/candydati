import { createInMemoryFileStorage } from '@candydati/core/testing';
import { MIGRATION_LIMITS } from '@candydati/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateAccount } from '../../../testing/fixtures/migration/teamtailor/large-account.js';
import { startTestApi, testReader, type TestApi } from '../../../testing/migration-test-api.js';
import { createPackageBuilder } from '../../package-builder.js';
import { splitPackage } from '../../package-split.js';
import { createTeamtailorConnector, type TeamtailorReport } from './index.js';

let api: TestApi;
beforeAll(async () => {
  api = await startTestApi();
});
afterAll(() => api.close());

const SIZE = { candidates: 18_000, jobs: 40, fileEvery: 30 } as const;
const credentials = { apiKey: 'secret-key-123' };

describe('Teamtailor connector: an account of 18,000 profiles', () => {
  it('reads 600 pages of candidates (and one size probe), reports progress with a total, and splits within the limits, fast', async () => {
    const account = generateAccount(SIZE);
    api.perPage = 30;
    const r = api.routes;
    const storage = api.origin.replace('api.teamtailor.com', 'files.example-cdn.net');
    r.set('/v1/users', account.users);
    r.set('/v1/jobs', account.jobs);
    for (const job of account.jobs) r.set(`/v1/jobs/${job.id}/stages`, account.stagesOf(String(job.id)));
    r.set('/v1/reject-reasons', account.rejectReasons);
    r.set('/v1/questions', account.questions);
    r.set('/v1/job-applications', account.applications);
    r.set('/v1/answers', account.answers);
    r.set('/v1/candidates', account.candidates(storage));
    r.set('/v1/uploads', account.uploads(storage));
    r.set('/v1/notes', account.notes);
    r.set('/files/resume.pdf', (_req, res) => void res.writeHead(200, { 'content-type': 'application/pdf' }).end('%PDF'));
    r.set('/files/cover_letter.pdf', (_req, res) => void res.writeHead(200, { 'content-type': 'application/pdf' }).end('%PDF'));

    const reports: TeamtailorReport[] = [];
    const connector = createTeamtailorConnector({ baseUrl: `${api.origin}/v1`, onReport: (report) => reports.push(report), now: () => new Date('2026-10-16T10:00:00Z') });
    const builder = createPackageBuilder({ files: createInMemoryFileStorage(), filePrefix: 'organizations/o/migrations/m/', source: { system: 'teamtailor', producer: 'connector:teamtailor@1', exportedAt: '2026-10-16T10:00:00.000Z' }, reserveFiles: async () => undefined });
    const progress: Array<[number, number | null | undefined]> = [];
    const reader = testReader([...connector.hosts(credentials)] as { exact: string }[]);

    const started = performance.now();
    await connector.fetch(credentials, builder, { reader, progress: async (done, total) => void progress.push([done, total]), notice: () => undefined });
    const parts = splitPackage(builder.collected(), MIGRATION_LIMITS);
    const seconds = (performance.now() - started) / 1000;

    expect(reports[0]).toMatchObject({ candidates: 18_000, candidatesSkipped: 0, applications: 24_000, applicationsSkipped: 0, answers: 18_000, notes: 6_000, filesSkipped: 0, files: 900 });
    expect(api.seen.filter((req) => req.url?.startsWith('/v1/candidates')).length).toBe(601);
    const last = progress.at(-1);
    expect(last?.[1]).toBeGreaterThan(0);
    expect(last?.[0]).toBe(last?.[1]);
    expect(parts).toHaveLength(1);
    expect(parts[0]?.counts).toMatchObject({ candidates: 18_000, applications: 24_000, notes: 6_000, files: 900 });
    expect(seconds).toBeLessThan(30);
    expect(process.memoryUsage().heapUsed).toBeLessThan(1024 ** 3);
  }, 180_000);
});
