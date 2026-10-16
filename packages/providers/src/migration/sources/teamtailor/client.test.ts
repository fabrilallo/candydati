import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { JsonReaderError } from '../../../http/index.js';
import { jobs } from '../../../testing/fixtures/migration/teamtailor/responses.js';
import { startTestApi, testReader, type TestApi } from '../../../testing/migration-test-api.js';
import { createTeamtailorClient, TEAMTAILOR_API_VERSION } from './client.js';

let api: TestApi;
beforeAll(async () => {
  api = await startTestApi();
});
afterAll(() => api.close());
beforeEach(() => {
  api.seen.length = 0;
  api.routes.clear();
  api.perPage = 2;
});

const client = () => createTeamtailorClient(testReader(), 'secret-key-123', `${api.origin}/v1`);
const collect = async <T>(source: AsyncIterable<T>): Promise<T[]> => {
  const out: T[] = [];
  for await (const item of source) out.push(item);
  return out;
};
const failure = async (promise: Promise<unknown>): Promise<JsonReaderError> => {
  const error = await promise.then(() => undefined, (e: unknown) => e);
  if (!(error instanceof JsonReaderError)) throw new Error(`expected JsonReaderError, got ${String(error)}`);
  return error;
};

describe('Teamtailor client', () => {
  it('sends the documented headers and page size, and follows links.next to the end', async () => {
    api.routes.set('/v1/jobs', [...jobs(), { ...jobs()[0]!, id: '1' }, { ...jobs()[0]!, id: '2' }]);
    const pages: number[] = [];
    const ids = (await collect(client().list('/jobs', 'jobs', { 'filter[status]': 'all' }, async (count) => void pages.push(count)))).map((job) => job.id);
    expect(ids).toEqual(['7199', '7200', '1', '2']);
    expect(pages).toEqual([2, 2]);
    expect(api.seen).toHaveLength(2);
    expect(api.seen[0]?.headers).toMatchObject({ authorization: 'Token token=secret-key-123', 'x-api-version': TEAMTAILOR_API_VERSION, accept: 'application/json' });
    const first = new URL(api.seen[0]?.url ?? '', 'http://x');
    expect(first.searchParams.get('page[size]')).toBe('30');
    expect(first.searchParams.get('filter[status]')).toBe('all');
    expect(new URL(api.seen[1]?.url ?? '', 'http://x').searchParams.get('page[number]')).toBe('2');
  });

  it('normalises ids to strings, tolerates null attributes and to-many relationship data', async () => {
    api.routes.set('/v1/users', { raw: { data: [{ id: 5, type: 'users', attributes: { name: null, email: null }, relationships: { jobs: { data: [] } } }] } });
    const users = await collect(client().list('/users', 'users'));
    expect(users[0]?.id).toBe('5');
  });

  it('reads the notes list in the shape the docs show as well as the usual one', async () => {
    api.routes.set('/v1/notes', { raw: { notes: [{ data: { id: 1, type: 'notes', attributes: { note: 'x', 'candidate-id': 4 } } }] } });
    expect((await collect(client().list('/notes', 'notes'))).map((note) => note.id)).toEqual(['1']);
  });

  it('turns refused credentials into a readable failure and never echoes the key', async () => {
    api.routes.set('/v1/jobs', (_req, res) => void res.writeHead(401).end('{"errors":["bad token secret-key-123"]}'));
    const error = await failure(collect(client().list('/jobs', 'jobs')));
    expect(error.code).toBe('credentials_refused');
    expect(error.message).not.toContain('secret-key-123');
  });

  it('refuses a page of the wrong shape, a next link to another origin, and a next link that loops', async () => {
    api.routes.set('/v1/jobs', { raw: { data: 'nope' } });
    expect((await failure(collect(client().list('/jobs', 'jobs')))).code).toBe('source_invalid_response');
    api.routes.set('/v1/jobs', { raw: { data: [], links: { next: 'https://evil.example.com/v1/jobs?page[number]=2' } } });
    expect((await failure(collect(client().list('/jobs', 'jobs')))).code).toBe('source_invalid_response');
    api.routes.set('/v1/jobs', (req, res) => void res.writeHead(200).end(JSON.stringify({ data: [], links: { next: `${api.origin}${req.url}` } })));
    expect((await failure(collect(client().list('/jobs', 'jobs')))).code).toBe('source_invalid_response');
  });
});
