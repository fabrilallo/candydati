import { createInMemoryFileStorage } from '@candydati/core/testing';
import { MIGRATION_PACKAGE_FORMAT, parseMigrationPackage } from '@candydati/domain';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJsonReader, JsonReaderError, type JsonReader } from '../../../http/index.js';
import { candidateDetail } from '../../../testing/fixtures/migration/recruitee/candidate-detail.js';
import { archivedOffersList, offerDetail, offersList } from '../../../testing/fixtures/migration/recruitee/offers.js';
import { notesResponse } from '../../../testing/fixtures/migration/recruitee/notes.js';
import { deletedHit, disqualifiedHit, hiredHit, retentionOverHit, searchHit, searchPage } from '../../../testing/fixtures/migration/recruitee/search-new-candidates.js';
import { createPackageBuilder } from '../../package-builder.js';
import { createConnectorRegistry, BUILT_IN_MIGRATION_CONNECTORS } from '../../registry.js';
import { createRecruiteeConnector, recruiteeCredentialsSchema, type RecruiteeConnectorOptions } from './index.js';
import type { RecruiteeStats } from './import-candidate.js';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Handler => (_req, res) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(body));
};
const code = (status: number, headers: Record<string, string> = {}): Handler => (_req, res) => res.writeHead(status, headers).end();

let server: Server;
let port = 0;
let routes = new Map<string, Handler>();
let requests: IncomingMessage[] = [];
const route = (path: string, handler: Handler): void => void routes.set(path, handler);
const count = (prefix: string): number => requests.filter((r) => (r.url ?? '').startsWith(prefix)).length;

beforeAll(async () => {
  server = createServer((req, res) => {
    requests.push(req);
    const path = (req.url ?? '').split('?')[0] ?? '';
    (routes.get(req.url ?? '') ?? routes.get(path) ?? code(404))(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const C = '/c/12345';
const origin = () => `http://api.recruitee.com:${port}`;
const waits: number[] = [];
const credentials = { company: '12345', token: 'tok_abcdefgh' };

beforeEach(() => {
  routes = new Map();
  requests = [];
  waits.length = 0;
  route(`${C}/offers`, json(offersList));
  route(`${C}/offers?scope=archived`, json(archivedOffersList));
  route(`${C}/offers/501`, json(offerDetail));
  route(`${C}/offers/503`, json(offerDetail));
  route(`${C}/candidates/101`, json(candidateDetail(`${origin()}/files/cv.pdf`)));
  route(`${C}/candidates/101/notes`, json(notesResponse));
  route('/files/cv.pdf', (_req, res) => res.writeHead(200, { 'content-type': 'application/pdf' }).end(Buffer.from('%PDF-1.4 test')));
});

const readerFor = (connector = createRecruiteeConnector()): JsonReader =>
  createJsonReader({
    allowedHosts: connector.hosts(credentials as never),
    unsafeAllowLoopbackForTests: true,
    resolve: async () => ['127.0.0.1'],
    sleep: async (ms) => void waits.push(ms),
    rate: connector.rate,
    backoff: { baseMs: 1, maxMs: 5 },
  });

async function run(options: RecruiteeConnectorOptions = {}) {
  const connector = createRecruiteeConnector({ baseUrl: origin(), ...options });
  const files = createInMemoryFileStorage();
  const builder = createPackageBuilder({ files, filePrefix: 'org/mig/', source: { system: 'recruitee', producer: 'connector:recruitee@1', exportedAt: '2025-06-01T00:00:00.000Z' }, reserveFiles: async () => undefined });
  const progress = vi.fn(async () => undefined);
  await connector.fetch(recruiteeCredentialsSchema.parse(credentials), builder, { reader: readerFor(connector), progress });
  const c = builder.collected();
  const parsed = parseMigrationPackage({ format: MIGRATION_PACKAGE_FORMAT, version: 1, source: c.source, users: c.users, jobs: c.jobs, candidates: c.candidates, applications: c.applications, notes: c.notes, messages: c.messages });
  return { collected: c, parsed, progress };
}

const mainHits = [searchHit(), disqualifiedHit, hiredHit, retentionOverHit, deletedHit, { nonsense: true }];

describe('Recruitee connector', () => {
  it('maps a full account into a valid package and sends the bearer token on every request', async () => {
    route(`${C}/search/new/candidates`, json(searchPage(mainHits)));
    let summary: RecruiteeStats | undefined;
    const { collected, parsed, progress } = await run({ onSummary: (s) => (summary = s) });
    expect(parsed.success).toBe(true);
    expect(requests.every((r) => r.headers.authorization === 'Bearer tok_abcdefgh')).toBe(true);
    expect(collected.candidates.map((c) => c.ref)).toEqual(['candidate-101', 'candidate-102', 'candidate-103']);
    const byRef = Object.fromEntries(collected.applications.map((a) => [a.ref, a]));
    expect(byRef['placement-9002']).toMatchObject({ outcome: 'not_selected', closedAt: '2025-04-01T10:00:00.000Z', jobRef: 'offer-502' });
    expect(byRef['placement-9003']).toMatchObject({ outcome: 'hired' });
    expect(byRef['placement-9001']).toMatchObject({ origin: 'career site', coverLetter: 'Dear team, I would like to apply.' });
    expect(byRef['placement-9001']?.outcome).toBeUndefined();
    expect(collected.jobs.map((j) => j.ref).sort()).toEqual(['offer-501', 'offer-502', 'offer-503']);
    expect(collected.jobs.find((j) => j.ref === 'offer-503')).toMatchObject({ status: 'closed', closedAt: '2023-06-01T00:00:00.000Z'.replace('00:00:00', '08:00:00') });
    expect(collected.jobs.find((j) => j.ref === 'offer-501')?.stages.map((s) => s.name)).toEqual(['Applied', 'Phone interview', 'Hired']);
    expect(collected.candidates[0]).toMatchObject({ email: 'ada.rossi@example.com', phone: '+39 333 1234567', linkedinUrl: 'https://www.linkedin.com/in/ada-rossi-example', tags: ['backend', 'remote'] });
    expect(collected.candidates[0]?.consent).toBeUndefined();
    expect(collected.notes).toEqual([expect.objectContaining({ candidateRef: 'candidate-101', authorName: 'Selection Team', body: 'Good first call, strong on APIs.' })]);
    expect(collected.files.size).toBe(1);
    expect(summary).toMatchObject({ candidates: 3, applications: 3, notes: 1, files: 1, skipped: { deleted: 1, retention_over: 1, invalid_record: 1 } });
    expect(progress).toHaveBeenCalled();
  });

  it('never carries ratings, photos or equal-opportunity data into the package', async () => {
    route(`${C}/search/new/candidates`, json(searchPage(mainHits)));
    const { collected } = await run();
    const dump = JSON.stringify({ ...collected, files: [] });
    for (const forbidden of ['rating', 'photo', 'eeo', 'positive', 'avatar', '4.5', 'disqualify_reason', 'initials']) expect(dump.toLowerCase()).not.toContain(forbidden);
  });

  it('pages through the search with limit, page and a stable sort, throttled and surviving a 429', async () => {
    const hits = Array.from({ length: 150 }, (_, i) => searchHit({ id: 1000 + i, name: `Person ${i}`, emails: [`p${i}@example.com`], placements: [] }));
    let calls = 0;
    route(`${C}/search/new/candidates`, (req, res) => {
      calls += 1;
      if (calls === 1) return code(429, { 'retry-after': '2' })(req, res);
      const page = Number(new URL(req.url ?? '', origin()).searchParams.get('page'));
      return json(searchPage(page === 1 ? hits.slice(0, 100) : hits.slice(100), 150))(req, res);
    });
    const { collected, parsed } = await run();
    expect(parsed.success).toBe(true);
    expect(collected.candidates).toHaveLength(150);
    const pages = requests.filter((r) => (r.url ?? '').includes('/search/new/candidates')).map((r) => new URL(r.url ?? '', origin()).searchParams);
    expect(pages.map((p) => p.get('page'))).toEqual(['1', '1', '2']);
    expect(pages.every((p) => p.get('limit') === '100' && p.get('sort_by') === 'created_at_asc')).toBe(true);
    expect(waits.some((ms) => ms >= 2000)).toBe(true);
    expect(waits.length).toBeGreaterThan(1);
  });

  it('refuses a token Recruitee refuses, with a readable code and no secret in the message', async () => {
    route(`${C}/search/new/candidates`, code(401));
    const error = await run().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(JsonReaderError);
    expect(error).toMatchObject({ code: 'credentials_refused' });
    expect(String((error as Error).message)).not.toContain('tok_abcdefgh');
  });

  it('fails readably on an answer that is not what the docs describe', async () => {
    route(`${C}/search/new/candidates`, json({ hits: 'nope' }));
    await expect(run()).rejects.toMatchObject({ code: 'source_invalid_response' });
  });

  it('skips unavailable detail and notes endpoints, counts them and still imports the people', async () => {
    route(`${C}/search/new/candidates`, json(searchPage([searchHit(), disqualifiedHit, hiredHit])));
    route(`${C}/candidates/101`, code(403));
    route(`${C}/candidates/101/notes`, code(404));
    const skips: string[] = [];
    const { collected, parsed } = await run({ onSkip: (endpoint, status) => skips.push(`${endpoint}:${status}`) });
    expect(parsed.success).toBe(true);
    expect(collected.candidates).toHaveLength(3);
    expect(collected.notes).toHaveLength(0);
    expect(collected.files.size).toBe(0);
    expect(count(`${C}/candidates/10`)).toBe(1 + 3); // one detail refused then switched off; notes still tried once per person
    expect(skips).toContain('candidate_detail:403');
    expect(skips.filter((s) => s.startsWith('notes:404'))).toHaveLength(3);
  });

  it('stops calling an endpoint that keeps answering 404', async () => {
    const hits = Array.from({ length: 8 }, (_, i) => searchHit({ id: 2000 + i, placements: [], emails: [`q${i}@example.com`] }));
    route(`${C}/search/new/candidates`, json(searchPage(hits)));
    await run();
    expect(requests.filter((r) => (r.url ?? '').endsWith('/notes'))).toHaveLength(5);
  });

  it('builds jobs from placements when the offers endpoint is not available', async () => {
    routes.delete(`${C}/offers`);
    routes.delete(`${C}/offers?scope=archived`);
    route(`${C}/search/new/candidates`, json(searchPage([searchHit(), disqualifiedHit])));
    const { collected, parsed } = await run();
    expect(parsed.success).toBe(true);
    expect(collected.jobs.map((j) => [j.ref, j.title, j.status])).toEqual(expect.arrayContaining([['offer-501', 'Backend Developer', 'open'], ['offer-502', 'Product Designer', 'closed']]));
    expect(collected.jobs.find((j) => j.ref === 'offer-501')?.stages).toEqual([{ ref: 'stage-71', name: 'Phone interview', type: 'screening_call' }]);
  });

  it('skips a file that cannot be downloaded and goes on', async () => {
    route(`${C}/search/new/candidates`, json(searchPage([searchHit()])));
    route('/files/cv.pdf', code(404));
    route(`${C}/candidates/101`, json(candidateDetail(`${origin()}/files/cv.pdf`, { attachments: [{ name: 'portfolio.pdf', url: `${origin()}/files/other.pdf` }, { name: 'bad', url: 'ftp://x' }] })));
    route('/files/other.pdf', (_req, res) => res.writeHead(200).end(Buffer.from('x')));
    let summary: RecruiteeStats | undefined;
    const { collected, parsed } = await run({ onSummary: (s) => (summary = s) });
    expect(parsed.success).toBe(true);
    expect(collected.applications[0]?.files).toEqual([expect.objectContaining({ kind: 'other', fileName: 'portfolio.pdf' })]);
    expect(summary?.skipped['file_not_found']).toBe(1);
  });

  it('refuses a file URL outside the allowed host without sending the token there', async () => {
    route(`${C}/search/new/candidates`, json(searchPage([searchHit()])));
    route(`${C}/candidates/101`, json(candidateDetail('https://files.elsewhere.example/cv.pdf')));
    let summary: RecruiteeStats | undefined;
    await run({ onSummary: (s) => (summary = s) });
    expect(summary?.skipped['file_host_not_allowed']).toBe(1);
  });

  it('keeps consent only with a given date and uses gdpr_expires_at as its expiry', async () => {
    route(`${C}/search/new/candidates`, json(searchPage([searchHit({ gdpr_consent_given_at: '2025-03-01T09:00:00.000Z' }), searchHit({ id: 106, gdpr_consent_given_at: '2025-03-01T09:00:00.000Z', gdpr_expires_at: null, placements: [] })])));
    const { collected, parsed } = await run();
    expect(parsed.success).toBe(true);
    expect(collected.candidates[0]?.consent).toEqual({ givenAt: '2025-03-01T09:00:00.000Z', expiresAt: '2099-03-01T09:00:00.000Z' });
    expect(collected.candidates[1]?.consent).toEqual({ givenAt: '2025-03-01T09:00:00.000Z' });
  });

  it('skips a candidate the package refuses and its applications, without failing the run', async () => {
    route(`${C}/search/new/candidates`, json(searchPage([searchHit({ id: 301, name: 'Bad <b>' }), searchHit({ id: 302, emails: ['not-an-email'], phones: ['abc'], name: 'Solo' })])));
    let summary: RecruiteeStats | undefined;
    const { collected, parsed } = await run({ onSummary: (s) => (summary = s) });
    expect(parsed.success).toBe(true);
    expect(summary?.skipped['candidate_refused']).toBe(1);
    expect(collected.candidates).toEqual([expect.objectContaining({ ref: 'candidate-302', firstName: 'Solo', lastName: '-' })]);
    expect(collected.candidates[0]?.email).toBeUndefined();
  });
});

describe('Recruitee credentials and description', () => {
  it('accepts a numeric company id or a subdomain and a token, and nothing else', () => {
    expect(recruiteeCredentialsSchema.safeParse({ company: ' Acme-Corp ', token: ' abcdefgh ' }).data).toEqual({ company: 'acme-corp', token: 'abcdefgh' });
    expect(recruiteeCredentialsSchema.safeParse({ company: '12345', token: 'abcdefgh' }).success).toBe(true);
    for (const bad of [{ company: 'a/b', token: 'abcdefgh' }, { company: '../x', token: 'abcdefgh' }, { company: '1', token: 'short' }, { company: '1', token: 'abcdefgh', extra: 1 }, { company: '', token: 'abcdefgh' }]) {
      expect(recruiteeCredentialsSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('is a beta API connector limited to api.recruitee.com, throttled below the documented rate, and registered', () => {
    const connector = createRecruiteeConnector();
    expect(connector).toMatchObject({ id: 'recruitee', maturity: 'beta', input: 'api', rate: { capacity: 5, refillPerSecond: 5 } });
    expect(connector.hosts(credentials)).toEqual([{ exact: 'api.recruitee.com' }]);
    expect(connector.fields.find((f) => f.name === 'token')).toMatchObject({ type: 'password', secret: true, howToUrl: expect.stringContaining('https://') });
    expect(createConnectorRegistry().get('recruitee')).toBeDefined();
    expect(BUILT_IN_MIGRATION_CONNECTORS.map((c) => c.id)).toContain('recruitee');
  });
});
