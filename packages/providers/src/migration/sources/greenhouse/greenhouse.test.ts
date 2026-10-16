import { createInMemoryFileStorage } from '@candydati/core/testing';
import { MIGRATION_LIMITS, parseMigrationPackage } from '@candydati/domain';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createJsonReader, JsonReaderError } from '../../../http/index.js';
import { docsApplication, docsApplicationStages, docsAttachment, docsCandidate, docsJob, docsNote, docsSources, docsStages, docsUsers, schemaEmailNote, schemaToken } from '../../../testing/fixtures/migration/greenhouse/docs-examples.js';
import { createPackageBuilder } from '../../package-builder.js';
import { splitPackage } from '../../package-split.js';
import { createGreenhouseConnector, greenhouseConnector } from './index.js';

interface Reply {
  readonly status?: number;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}
type Route = (url: URL, req: IncomingMessage) => Reply;
interface Seen {
  readonly method: string;
  readonly path: string;
  readonly query: string;
  readonly authorization: string | undefined;
  readonly body: string;
}

let server: Server;
let origin = '';
let seen: Seen[] = [];
let routes: Record<string, Route> = {};
let issued = 0;
let revokeNext = false;
let tokenReply: Reply | undefined;

const send = (res: ServerResponse, reply: Reply): void => {
  const payload = reply.body === undefined ? undefined : typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body);
  res.writeHead(reply.status ?? 200, { 'content-type': typeof reply.body === 'string' ? 'application/pdf' : 'application/json', ...reply.headers }).end(payload);
};

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', origin);
      seen.push({ method: req.method ?? '', path: url.pathname, query: url.search, authorization: req.headers.authorization, body: Buffer.concat(chunks).toString() });
      if (url.pathname === '/token') {
        issued += 1;
        return send(res, tokenReply ?? { body: { ...schemaToken, access_token: `token-${issued}` } });
      }
      if (revokeNext && url.pathname.startsWith('/v3/')) {
        revokeNext = false;
        return send(res, { status: 401 });
      }
      const route = routes[url.pathname];
      if (route === undefined) return send(res, { status: 404 });
      const stale = url.pathname.startsWith('/v3/') && req.headers.authorization !== `Bearer token-${issued}`;
      return send(res, stale ? { status: 401 } : route(url, req));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://gh.example.com:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const asJob = { ...docsJob, id: 1, is_template: false, name: 'Backend Developer', status: 'closed', closed_at: '2024-03-01T00:00:00.000Z' };
const FORBIDDEN = { rating: 'definitely_not', candidate_rating: 'strong', scorecards: [{ overall: 'yes' }], eeoc: { gender: 'x' }, salary: 91000 };
const pdf = (text: string): Reply => ({ body: text });

const defaults = (): Record<string, Route> => ({
  '/v3/users': (url) => (url.searchParams.has('cursor') ? { body: [docsUsers[1]] } : { body: [docsUsers[0]], headers: { link: `<${origin}/v3/users?cursor=page2>; rel="next"` } }),
  '/v3/sources': () => ({ body: docsSources }),
  '/v3/jobs': () => ({ body: [docsJob, { ...asJob, ...FORBIDDEN }] }),
  '/v3/job_interview_stages': () => ({ body: docsStages }),
  '/v3/candidates': () => ({ body: [{ ...docsCandidate, ...FORBIDDEN }, { ...docsCandidate, id: 2, first_name: null, last_name: null }] }),
  '/v3/application_stages': () => ({ body: [...docsApplicationStages, { id: 6, application_id: 1, job_interview_stage_id: 3, entered_at: '2024-01-03T00:00:00.000Z', exited_at: null, days_in_stage: 0, current: false }, { id: 7, application_id: 1, job_interview_stage_id: 99, entered_at: '2024-01-04T00:00:00.000Z' }] }),
  '/v3/applications': () => ({
    body: [
      { ...docsApplication, ...FORBIDDEN },
      { ...docsApplication, id: 2, status: 'rejected', rejected_at: '2024-02-01T00:00:00.000Z', source_id: 14, job_interview_stage_id: null, answers: [{ question: 'Q', answer: '' }] },
      { ...docsApplication, id: 3, status: 'hired', updated_at: '2024-03-01T00:00:00.000Z', source_id: null },
      { ...docsApplication, id: 4, job_id: null },
      { ...docsApplication, id: 5, job_id: 99 },
      { ...docsApplication, id: 6, candidate_id: 77 },
    ],
  }),
  '/v3/notes': () => ({
    body: [
      docsNote,
      { ...docsNote, id: 10, application_id: 2, user_id: 2, visibility: 'publicly_visible', body: 'Colloquio positivo' },
      { ...docsNote, id: 11, application_id: 5, body: 'Application of nobody' },
      { ...docsNote, id: 12, candidate_id: 77 },
      { ...docsNote, id: 13, body: '   ' },
      { ...docsNote, id: 14, type: 'ACTIVITY', body: 'Moved to stage' },
      { ...docsNote, id: 15, type: 'FEEDBACK', body: 'Scorecard text' },
      schemaEmailNote,
      { ...schemaEmailNote, id: 20, email_from: 'Pete <Current@Example.com>', email_to: 'recruiter@example.com', subject: null },
      { ...schemaEmailNote, id: 21, application_id: null },
      { ...schemaEmailNote, id: 22, body: null },
    ],
  }),
  '/v3/attachments': () => ({
    body: [
      { ...docsAttachment, url: `${origin}/files/cv.pdf` },
      { ...docsAttachment, id: 2, url: `${origin}/files/cv2.pdf`, filename: 'second.pdf' },
      { ...docsAttachment, id: 3, type: 'cover_letter', url: `${origin}/files/cl.pdf`, filename: 'letter.pdf' },
      { ...docsAttachment, id: 4, type: 'offer_letter', url: `${origin}/files/offer.pdf` },
      { ...docsAttachment, id: 5, type: 'other', url: `${origin}/files/missing.pdf` },
      { ...docsAttachment, id: 6, application_id: 5, url: `${origin}/files/never.pdf` },
      { ...docsAttachment, id: 7, type: 'other', url: 'https://elsewhere.example.com/f.pdf' },
    ],
  }),
  '/files/cv.pdf': () => pdf('cv'),
  '/files/cv2.pdf': () => pdf('cv2'),
  '/files/cl.pdf': () => pdf('cl'),
});

beforeEach(() => {
  seen = [];
  issued = 0;
  revokeNext = false;
  tokenReply = undefined;
  routes = defaults();
});

const connector = () => createGreenhouseConnector({ token: `${origin}/token`, api: `${origin}/v3` });
const credentials = { clientId: 'client-id', clientSecret: 'client-secret' };

const run = async (options: { maxRetries?: number } = {}) => {
  const waits: number[] = [];
  const progress: number[] = [];
  const stored = createInMemoryFileStorage();
  const builder = createPackageBuilder({ files: stored, filePrefix: 'organizations/o/migrations/m/', source: { system: 'greenhouse', producer: 'connector:greenhouse@1', exportedAt: '2026-10-16T10:00:00.000Z' }, reserveFiles: async () => undefined });
  const c = connector();
  const reader = createJsonReader({ allowedHosts: c.hosts(credentials), unsafeAllowLoopbackForTests: true, resolve: async () => ['127.0.0.1'], sleep: async (ms) => { waits.push(ms); }, random: () => 1, backoff: { baseMs: 10, maxMs: 10 }, maxRetries: options.maxRetries ?? 2 });
  await c.fetch(credentials, builder, { reader, progress: async (done) => { progress.push(done); } });
  return { builder, collected: builder.collected(), waits, progress, stored };
};

const failure = async (promise: Promise<unknown>): Promise<JsonReaderError> => {
  const error = await promise.then(() => undefined, (e: unknown) => e);
  if (!(error instanceof JsonReaderError)) throw new Error(`expected a JsonReaderError, got ${String(error)}`);
  return error;
};

describe('the Greenhouse connector, described', () => {
  it('is beta, reads the API with two secrets-aware fields and only the two Greenhouse hosts', () => {
    expect(greenhouseConnector).toMatchObject({ id: 'greenhouse', maturity: 'beta', input: 'api', docsUrl: 'https://harvestdocs.greenhouse.io/' });
    expect(greenhouseConnector.hosts(credentials)).toEqual([{ exact: 'auth.greenhouse.io' }, { exact: 'harvest.greenhouse.io' }]);
    expect(greenhouseConnector.fields.map((f) => [f.name, f.type, f.secret])).toEqual([['clientId', 'text', false], ['clientSecret', 'password', true]]);
    for (const field of greenhouseConnector.fields) {
      expect(field.howToUrl).toMatch(/^https:\/\/harvestdocs\.greenhouse\.io/);
      expect(field.label.it.length).toBeGreaterThan(0);
    }
    expect(greenhouseConnector.fields[0]?.help?.en).toMatch(/private data/i);
    expect(greenhouseConnector.fields[0]?.help?.it).toMatch(/private data/i);
    expect(greenhouseConnector.rate).toBeDefined();
  });

  it('checks the credentials strictly', () => {
    const schema = greenhouseConnector.credentials;
    expect(schema.safeParse(credentials).success).toBe(true);
    expect(schema.safeParse({ ...credentials, extra: 'x' }).success).toBe(false);
    expect(schema.safeParse({ clientId: '', clientSecret: 'x' }).success).toBe(false);
    expect(schema.safeParse({ clientId: 'x' }).success).toBe(false);
  });
});

describe('a full run against a local Harvest v3', () => {
  it('builds a package that parseMigrationPackage accepts', async () => {
    const { collected } = await run();
    const part = splitPackage(collected, MIGRATION_LIMITS).at(0);
    expect(part).toBeDefined();
    const parsed = parseMigrationPackage(part?.manifest);
    expect(parsed.error?.issues).toBeUndefined();
    expect(parsed.success).toBe(true);
  });

  it('maps users, the job with its stages in plan order, and skips templates and nameless candidates', async () => {
    const { collected } = await run();
    expect(collected.users).toEqual([{ ref: '1', name: 'Admin User', email: 'bob_johnson734@localhost.com' }, { ref: '2', name: 'Admin Sample', email: 'sample@example.com' }]);
    expect(collected.jobs).toHaveLength(1);
    expect(collected.jobs[0]).toMatchObject({ ref: '1', title: 'Backend Developer', status: 'closed', closedAt: '2024-03-01T00:00:00.000Z' });
    expect(collected.jobs[0]?.stages.map((s) => [s.ref, s.name])).toEqual([['1', 'Interview Stage'], ['4', 'Application Review'], ['3', 'Phone Interview'], ['2', 'Take Home Test']]);
    expect(collected.candidates).toHaveLength(1);
    expect(collected.candidates[0]).toMatchObject({ ref: '1', firstName: 'Pete', lastName: 'Current Person', email: 'current@example.com', phone: '999-555-1212', linkedinUrl: 'https://linkedin.com/some_user', tags: ['current', 'tagged'] });
    expect(collected.candidates[0]?.consent).toBeUndefined();
  });

  it('maps applications: outcomes, origin, stage history from application stages, answers; drops what has no home', async () => {
    const { collected } = await run();
    expect(collected.applications.map((a) => a.ref)).toEqual(['1', '2', '3']);
    const [open, rejected, hired] = collected.applications;
    expect(open).toMatchObject({ stageRef: '1', origin: 'Former Colleagues', answers: [{ question: 'Simple question', answer: 'some answer' }] });
    expect(open?.outcome).toBeUndefined();
    expect(open?.stageHistory).toEqual([{ stageRef: '4', enteredAt: '2024-01-01T00:00:00.000Z' }, { stageRef: '3', enteredAt: '2024-01-03T00:00:00.000Z' }]);
    expect(rejected).toMatchObject({ outcome: 'not_selected', closedAt: '2024-02-01T00:00:00.000Z', origin: 'LinkedIn', stageRef: '1', answers: [] });
    expect(hired).toMatchObject({ outcome: 'hired', closedAt: '2024-03-01T00:00:00.000Z' });
    expect(hired?.origin).toBeUndefined();
  });

  it('keeps NOTE notes with author and visibility, EMAIL notes as messages with a direction, and ignores other types', async () => {
    const { collected } = await run();
    expect(collected.notes).toEqual([
      { candidateRef: '1', authorRef: '1', body: 'Admin-only note', createdAt: '2024-01-01T12:30:30.000Z', private: true },
      { candidateRef: '1', applicationRef: '2', authorRef: '2', body: 'Colloquio positivo', createdAt: '2024-01-01T12:30:30.000Z', private: false },
      // Its application is not in the package: the note stays on the candidate.
      { candidateRef: '1', authorRef: '1', body: 'Application of nobody', createdAt: '2024-01-01T12:30:30.000Z', private: true },
    ]);
    expect(collected.messages.map((m) => [m.direction, m.from, m.to, m.subject])).toEqual([
      ['outbound', 'recruiter@example.com', 'current@example.com', 'Next steps for the role'],
      ['inbound', 'current@example.com', 'recruiter@example.com', undefined],
    ]);
    expect(collected.messages.every((m) => m.applicationRef === '1')).toBe(true);
  });

  it('downloads files right after their record, one CV at most, skips failures, drops offers', async () => {
    const { collected, stored } = await run();
    const files = collected.applications[0]?.files;
    expect(files?.map((f) => [f.kind, f.fileName])).toEqual([['cv', 'Oldest Attachments'], ['other', 'second.pdf'], ['cover_letter', 'letter.pdf']]);
    expect(stored.keys()).toHaveLength(3);
    const requested = seen.map((s) => s.path);
    expect(requested).toEqual(expect.arrayContaining(['/files/cv.pdf', '/files/cv2.pdf', '/files/cl.pdf', '/files/missing.pdf']));
    expect(requested).not.toContain('/files/offer.pdf');
    expect(requested).not.toContain('/files/never.pdf');
    expect(seen.find((s) => s.path === '/files/cv.pdf')?.authorization).toBe('Bearer token-1');
  });

  it('never carries forbidden data and never calls scorecard, EEOC, demographic or offer endpoints', async () => {
    const { collected } = await run();
    const text = JSON.stringify(collected, (_k, v: unknown) => (v instanceof Map ? [...v] : v));
    for (const word of ['definitely_not', 'strong', 'scorecard', 'eeoc', 'gender', '91000', 'Scorecard text', 'rating']) expect(text.toLowerCase(), word).not.toContain(word.toLowerCase());
    for (const call of seen) expect(call.path, call.path).not.toMatch(/eeoc|demographic|scorecard|offer|rating|ai_|opt/);
    const lists = [...new Set(seen.filter((s) => s.path.startsWith('/v3/')).map((s) => s.path))];
    expect(lists.sort()).toEqual(['/v3/application_stages', '/v3/applications', '/v3/attachments', '/v3/candidates', '/v3/job_interview_stages', '/v3/jobs', '/v3/notes', '/v3/sources', '/v3/users']);
  });

  it('writes only through reads: GET everywhere but the one token exchange', async () => {
    await run();
    expect(seen.filter((s) => s.method !== 'GET').map((s) => [s.method, s.path])).toEqual([['POST', '/token']]);
  });

  it('reports progress at least at the start and after every page and file', async () => {
    const { progress } = await run();
    expect(progress[0]).toBe(0);
    expect(progress.length).toBeGreaterThan(10);
    expect(progress.at(-1)).toBeGreaterThan(0);
  });
});

describe('token', () => {
  it('exchanges client credentials with HTTP Basic and a form body, then sends the bearer', async () => {
    await run();
    const token = seen.filter((s) => s.path === '/token');
    expect(token).toHaveLength(1);
    expect(token[0]).toMatchObject({ method: 'POST', body: 'grant_type=client_credentials', authorization: `Basic ${Buffer.from('client-id:client-secret').toString('base64')}` });
    expect(seen.filter((s) => s.path.startsWith('/v3/')).every((s) => s.authorization === 'Bearer token-1')).toBe(true);
  });

  it('renews the token once on a 401 and repeats the request', async () => {
    revokeNext = true;
    const { collected } = await run();
    expect(seen.filter((s) => s.path === '/token')).toHaveLength(2);
    const users = seen.filter((s) => s.path === '/v3/users');
    expect(users[0]?.authorization).toBe('Bearer token-1');
    expect(users[1]?.authorization).toBe('Bearer token-2');
    expect(collected.users).toHaveLength(2);
  });

  it('gives up with credentials_refused when a fresh token is refused too', async () => {
    routes['/v3/users'] = () => ({ status: 401 });
    const error = await failure(run());
    expect([error.code, error.status]).toEqual(['credentials_refused', 401]);
    expect(seen.filter((s) => s.path === '/token')).toHaveLength(2);
  });

  it.each([[401, 'credentials_refused'], [400, 'credentials_refused'], [403, 'credentials_refused'], [500, 'source_unavailable']])('maps a token answer %i to %s', async (status, code) => {
    tokenReply = { status };
    expect((await failure(run({ maxRetries: 0 }))).code).toBe(code);
  });

  it('refuses a token answer of the wrong shape, without echoing it', async () => {
    tokenReply = { body: { access_token: 'LEAKED-TOKEN' } };
    const error = await failure(run());
    expect(error.code).toBe('source_invalid_response');
    expect(error.message).not.toContain('LEAKED-TOKEN');
  });
});

describe('pagination', () => {
  it('follows the Link header exactly, with per_page only on the first request', async () => {
    await run();
    const users = seen.filter((s) => s.path === '/v3/users');
    expect(users.map((s) => s.query)).toEqual(['?per_page=500', '?cursor=page2']);
    const stages = seen.find((s) => s.path === '/v3/job_interview_stages');
    expect(new URLSearchParams(stages?.query).get('job_ids')).toBe('1');
  });

  it('stops without a Link header, and treats an empty one as the end', async () => {
    routes['/v3/users'] = () => ({ body: [docsUsers[0]], headers: { link: '' } });
    const { collected } = await run();
    expect(collected.users).toHaveLength(1);
    expect(seen.filter((s) => s.path === '/v3/users')).toHaveLength(1);
  });

  it('ignores other relations and refuses a next link on another origin', async () => {
    routes['/v3/users'] = () => ({ body: [], headers: { link: `<${origin}/v3/users?cursor=a>; rel="prev"` } });
    await run();
    expect(seen.filter((s) => s.path === '/v3/users')).toHaveLength(1);
    routes['/v3/users'] = () => ({ body: [], headers: { link: '<https://evil.example.com/v3/users?cursor=a>; rel="next"' } });
    expect((await failure(run())).code).toBe('source_invalid_response');
  });

  it('asks stage definitions for at most 50 jobs at a time', async () => {
    routes['/v3/jobs'] = () => ({ body: Array.from({ length: 120 }, (_, i) => ({ ...asJob, id: i + 1 })) });
    routes['/v3/job_interview_stages'] = (url) => ({ body: (url.searchParams.get('job_ids') ?? '').split(',').map((id) => ({ ...docsStages[0], id: Number(id) * 10, job_id: Number(id) })) });
    const { collected } = await run();
    const asks = seen.filter((s) => s.path === '/v3/job_interview_stages').map((s) => (new URLSearchParams(s.query).get('job_ids') ?? '').split(',').length);
    expect(asks).toEqual([50, 50, 20]);
    expect(collected.jobs).toHaveLength(120);
  });
});

describe('rate limits and failures', () => {
  it('waits Retry-After on a 429 and goes on', async () => {
    let first = true;
    routes['/v3/jobs'] = () => {
      if (!first) return { body: [asJob] };
      first = false;
      return { status: 429, headers: { 'retry-after': '7', 'x-ratelimit-remaining': '0' } };
    };
    const { waits, collected } = await run();
    expect(waits).toContain(7000);
    expect(collected.jobs).toHaveLength(1);
  });

  it('waits for a spent window when the headers say so', async () => {
    routes['/v3/users'] = () => ({ body: [], headers: { 'x-ratelimit-limit': '75', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '12' } });
    const { waits } = await run();
    expect(waits).toContain(12_000);
  });

  it('fails with a readable code when the source is down, answers nonsense, or a page has the wrong shape', async () => {
    routes['/v3/candidates'] = () => ({ status: 500 });
    expect((await failure(run({ maxRetries: 1 }))).code).toBe('source_unavailable');
    routes['/v3/candidates'] = () => ({ body: { not: 'an array' } });
    expect((await failure(run())).code).toBe('source_invalid_response');
    routes['/v3/candidates'] = () => ({ body: [{ id: 'x' }] });
    expect((await failure(run())).code).toBe('source_invalid_response');
  });

  it('tolerates a source list the token may not read, and fails on a required one', async () => {
    routes['/v3/sources'] = () => ({ status: 403 });
    const { collected } = await run();
    expect(collected.applications.every((a) => a.origin === undefined)).toBe(true);
    routes['/v3/sources'] = () => ({ status: 500 });
    expect((await failure(run({ maxRetries: 0 }))).code).toBe('source_unavailable');
    routes['/v3/sources'] = () => ({ body: docsSources });
    routes['/v3/notes'] = () => ({ status: 403 });
    expect((await failure(run())).code).toBe('credentials_refused');
  });
});
