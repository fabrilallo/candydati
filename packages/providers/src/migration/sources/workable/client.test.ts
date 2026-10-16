import { afterEach, describe, expect, it } from 'vitest';
import { JsonReaderError } from '../../../http/index.js';
import { startWorkable, workableFixture, type WorkableHarness } from '../../../testing/workable-harness.js';
import { createWorkableClient } from './client.js';

let harness: WorkableHarness | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

const TOKEN = 'wk_test_token_123456';
const collect = async <T>(source: AsyncIterable<T>): Promise<T[]> => {
  const all: T[] = [];
  for await (const item of source) all.push(item);
  return all;
};
const fail = async (promise: Promise<unknown>): Promise<unknown> => promise.then(() => undefined, (error: unknown) => error);

describe('createWorkableClient', () => {
  it('sends the bearer token on every request, 100 per page, and follows paging.next by since_id on its own host', async () => {
    const jobs = workableFixture<{ jobs: Record<string, unknown>[] }>('jobs').jobs;
    harness = await startWorkable(() => (url) =>
      url.searchParams.has('since_id')
        ? { body: { jobs: [jobs[1]], paging: {} } }
        : { body: { jobs: [jobs[0]], paging: { next: 'https://www.workable.com/spi/v3/accounts/groove-tech/jobs?limit=100&since_id=1166bf8c' } } },
    );
    const client = createWorkableClient(harness.reader, harness.baseUrl, TOKEN);
    expect((await collect(client.jobs('draft'))).map((job) => job.shortcode)).toEqual(['GROOV003', 'GROOV001']);
    expect(harness.requests.map((request) => `${request.url.pathname}?${request.url.searchParams.toString()}`)).toEqual([
      '/spi/v3/jobs?limit=100&state=draft',
      '/spi/v3/jobs?limit=100&state=draft&since_id=1166bf8c',
    ]);
    for (const request of harness.requests) expect(request.headers).toMatchObject({ authorization: `Bearer ${TOKEN}`, host: `acme.workable.com:${harness.port}` });
  });

  it('asks for every member, inactive ones included, and reads the stages', async () => {
    harness = await startWorkable(() => (url) => (url.pathname.endsWith('/members') ? { body: workableFixture('members') } : { body: workableFixture('stages') }));
    const client = createWorkableClient(harness.reader, harness.baseUrl, TOKEN);
    expect((await collect(client.members())).map((member) => member.id)).toEqual(['3dae6411']);
    expect(harness.requests[0]?.url.searchParams.get('status')).toBe('all');
    expect((await client.stages()).map((stage) => stage.slug)).toEqual(['sourced', 'applied', 'phone-screen', 'interview', 'offer', 'hired']);
  });

  it('lists a job\'s candidates by shortcode and reads one candidate and its activities', async () => {
    harness = await startWorkable(() => (url) => {
      if (url.pathname.endsWith('/activities')) return { body: workableFixture('activities') };
      if (url.pathname.endsWith('/candidates/108d1748')) return { body: workableFixture('candidate-show') };
      return { body: { candidates: workableFixture<{ candidates: { id: string }[] }>('candidates-list').candidates } };
    });
    const client = createWorkableClient(harness.reader, harness.baseUrl, TOKEN);
    expect(await collect(client.candidateIds('GROOV005'))).toEqual(['ce4da98', '108d1748']);
    expect(harness.requests[0]?.url.searchParams.get('shortcode')).toBe('GROOV005');
    expect((await client.candidate('108d1748')).email).toBe('cindy_sawyers@gmail.com');
    expect((await collect(client.activities('108d1748'))).map((activity) => activity.action)).toEqual(['applied', 'comment', 'phone-screen', 'message', 'event']);
  });

  it('refuses a page that never ends (the same since_id twice) and an answer of the wrong shape', async () => {
    harness = await startWorkable(() => (url) => (url.pathname.endsWith('/stages') ? { body: { stages: 'nope' } } : { body: { jobs: [], paging: { next: 'https://x.workable.com/spi/v3/jobs?since_id=same' } } }));
    const client = createWorkableClient(harness.reader, harness.baseUrl, TOKEN);
    expect(await fail(collect(client.jobs('draft')))).toMatchObject({ code: 'source_invalid_response' });
    expect(await fail(client.stages())).toMatchObject({ code: 'source_invalid_response' });
  });

  it('ignores a paging.next it cannot read, and fails with the reader\'s own error on 401 and 404', async () => {
    harness = await startWorkable(() => (url) => {
      if (url.pathname.endsWith('/jobs')) return { body: { jobs: [], paging: { next: 'not a url' } } };
      return url.pathname.includes('/candidates/gone') ? undefined : { status: 401, body: { error: 'Not authorized' } };
    });
    const client = createWorkableClient(harness.reader, harness.baseUrl, TOKEN);
    expect(await collect(client.jobs('closed'))).toEqual([]);
    expect(await fail(client.stages())).toEqual(new JsonReaderError('credentials_refused', 401));
    expect(await fail(client.candidate('gone'))).toEqual(new JsonReaderError('not_found', 404));
  });

  it('streams a file through the reader with the same token', async () => {
    harness = await startWorkable(() => () => ({ raw: new TextEncoder().encode('%PDF-1.4') }));
    const client = createWorkableClient(harness.reader, harness.baseUrl, TOKEN);
    let stored = '';
    const result = await client.download(`${harness.origin}/files/cv.pdf`, async (source, mediaType) => {
      for await (const chunk of source) stored += new TextDecoder().decode(chunk);
      expect(mediaType).toBe('application/pdf');
      return stored.length;
    });
    expect(stored).toBe('%PDF-1.4');
    expect(result.bytes).toBe(8);
    expect(harness.requests[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('downloads a CV on another host (another Workable subdomain included) without the token', async () => {
    harness = await startWorkable(() => () => ({ raw: new TextEncoder().encode('%PDF-1.4') }));
    const client = createWorkableClient(harness.reader, harness.baseUrl, TOKEN);
    const keep = async (source: AsyncIterable<Uint8Array>) => {
      let size = 0;
      for await (const chunk of source) size += chunk.length;
      return size;
    };
    for (const host of ['workable-files.s3.amazonaws.com', 'files.workable.com']) {
      const url = harness.origin.replace('acme.workable.com', host);
      expect((await client.download(`${url}/resumes/cv.pdf?Signature=s`, keep)).bytes).toBe(8);
    }
    expect(harness.requests.map((request) => request.headers.host)).toEqual([`workable-files.s3.amazonaws.com:${harness.port}`, `files.workable.com:${harness.port}`]);
    for (const request of harness.requests) expect(request.headers.authorization).toBeUndefined();
  });
});
