import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { JsonReader } from '../../../http/index.js';
import { createGreenhouseClient, nextLink } from './client.js';
import { addressesIn, fileKindOf, isLinkedInUrl, mapApplication, mapCandidate, mapEmail, mapJob, mapNote, mapStages, mapUser } from './map.js';

const URLS = { token: 'https://auth.greenhouse.io/token', api: 'https://harvest.greenhouse.io/v3' };
const credentials = { clientId: 'id', clientSecret: 'secret' };

describe('nextLink', () => {
  it.each([
    ['<https://h/v3/jobs?cursor=abc>; rel="next"', 'https://h/v3/jobs?cursor=abc'],
    ['<https://h/v3/jobs?cursor=abc>;rel=next', 'https://h/v3/jobs?cursor=abc'],
    ['<https://h/a>; rel="prev", <https://h/b?cursor=x>; rel="next"', 'https://h/b?cursor=x'],
    ['<https://h/a>; rel="prev"', undefined],
    ['', undefined],
    [undefined, undefined],
    ['garbage', undefined],
  ])('reads %s', (header, expected) => {
    expect(nextLink(header)).toBe(expected);
  });
});

describe('the client', () => {
  const fakeReader = (clock: { now: number }) => {
    const posts: number[] = [];
    const reader = {
      postForm: vi.fn(async () => {
        posts.push(clock.now);
        return { data: { access_token: `t${posts.length}`, token_type: 'Bearer', expires_in: 120 }, headers: {} };
      }),
      getJson: vi.fn(async (_url: string, _schema: unknown, extras?: { headers?: Record<string, string> }) => ({ data: [extras?.headers?.authorization], headers: {} })),
      download: vi.fn(async () => ({ bytes: 0, mediaType: null })),
      downloadPublicFile: vi.fn(async () => ({ bytes: 0, mediaType: null })),
    };
    return { reader: reader as unknown as JsonReader, raw: reader, posts };
  };

  it('renews the token a minute before it expires, and not earlier', async () => {
    const clock = { now: 0 };
    const { reader, posts, raw } = fakeReader(clock);
    const client = createGreenhouseClient(reader, credentials, { urls: URLS, now: () => clock.now });
    const read = async () => { for await (const page of client.pages('jobs', {}, z.string())) return page; return []; };
    expect(await read()).toEqual(['Bearer t1']);
    clock.now = 30_000;
    expect(await read()).toEqual(['Bearer t1']);
    clock.now = 61_000;
    expect(await read()).toEqual(['Bearer t2']);
    expect(posts).toHaveLength(2);
    expect(raw.getJson.mock.calls[0]?.[0]).toBe('https://harvest.greenhouse.io/v3/jobs?per_page=500');
  });

  it('sends the bearer to downloads on the API host only; any other file is a public file, without credentials', async () => {
    const { reader, raw } = fakeReader({ now: 0 });
    const client = createGreenhouseClient(reader, credentials, { urls: URLS });
    const store = async () => 0;
    await client.download('https://harvest.greenhouse.io/v3/files/1', store);
    await client.download('https://files.example.com/x', store);
    await client.download('not a url', store);
    expect(raw.download.mock.calls.map((c) => (c as unknown[])[2])).toEqual([{ headers: { authorization: 'Bearer t1' } }]);
    expect(raw.downloadPublicFile.mock.calls.map((c) => c as unknown[])).toEqual([['https://files.example.com/x', store], ['not a url', store]]);
    expect(raw.postForm).toHaveBeenCalledTimes(1);
  });
});

describe('mapping edge cases', () => {
  const candidate = { id: 1, first_name: 'Ada', last_name: null, created_at: '2024-01-01T00:00:00Z' };

  it('users: name from parts, then email; nobody without any', () => {
    expect(mapUser({ id: 1, first_name: 'Ada', last_name: 'B', primary_email: 'bad' })).toEqual({ ref: '1', name: 'Ada B' });
    expect(mapUser({ id: 2, primary_email: 'a@example.com' })).toEqual({ ref: '2', name: 'a@example.com', email: 'a@example.com' });
    expect(mapUser({ id: 3, primary_email: '' })).toBeNull();
  });

  it('candidates: one name is enough, bad contact values are left out, tags are bounded', () => {
    const mapped = mapCandidate({ ...candidate, phone_numbers: [{ value: 'x' }], email_addresses: [{ value: 'nope' }], social_media_addresses: [{ value: 'https://twitter.com/a' }, { value: 'https://linkedin.com/in/ada' }], tags: Array.from({ length: 30 }, (_, i) => `t${i}`).concat(['t0', ' ']) });
    expect(mapped).toMatchObject({ firstName: 'Ada', lastName: 'Ada', linkedinUrl: 'https://linkedin.com/in/ada' });
    expect(mapped?.email).toBeUndefined();
    expect(mapped?.phone).toBeUndefined();
    expect(mapped?.tags).toHaveLength(20);
    expect(mapCandidate({ ...candidate, first_name: null })).toBeNull();
    expect(mapCandidate({ id: 3, first_name: null, last_name: 'Bianchi', created_at: '2024-01-01T00:00:00Z' })).toMatchObject({ firstName: 'Bianchi', lastName: 'Bianchi' });
  });

  it('jobs: a closed job without a date, a close before the creation, and a draft', () => {
    const job = { id: 1, name: 'X', status: 'closed' as const, created_at: '2024-05-01T00:00:00Z' };
    expect(mapJob(job, [])?.closedAt).toBeUndefined();
    expect(mapJob({ ...job, closed_at: '2024-01-01T00:00:00Z' }, [])?.closedAt).toBe('2024-05-01T00:00:00.000Z');
    expect(mapJob({ ...job, status: 'draft', closed_at: '2024-06-01T00:00:00Z' }, [])).not.toHaveProperty('closedAt');
    expect(mapJob({ ...job, is_template: true }, [])).toBeNull();
  });

  it('stages: at most the package limit, named even when blank, ties broken by id', () => {
    const stages = Array.from({ length: 60 }, (_, i) => ({ id: i + 1, job_id: 1, name: i === 0 ? ' ' : `S${i}`, sort_order: 0 }));
    const mapped = mapStages(stages);
    expect(mapped).toHaveLength(50);
    expect(mapped[0]).toEqual({ ref: '1', name: 'Stage' });
  });

  const application = { id: 1, candidate_id: 1, job_id: 1, status: 'in_process' as const, created_at: '2024-02-01T00:00:00Z', updated_at: '2024-03-01T00:00:00Z' };
  it('applications: a job without stages cannot hold one; a rejection before creation is clamped; history is capped and ordered', () => {
    expect(mapApplication(application, { jobStages: [], history: [], sourceName: undefined })).toBeNull();
    const rejected = mapApplication({ ...application, status: 'rejected', rejected_at: '2024-01-01T00:00:00Z' }, { jobStages: ['1'], history: [], sourceName: undefined });
    expect(rejected).toMatchObject({ outcome: 'not_selected', closedAt: '2024-02-01T00:00:00.000Z' });
    const noDate = mapApplication({ ...application, status: 'rejected' }, { jobStages: ['1'], history: [], sourceName: undefined });
    expect(noDate?.closedAt).toBe('2024-03-01T00:00:00.000Z');
    const history = Array.from({ length: 250 }, (_, i) => ({ application_id: 1, job_interview_stage_id: 1, entered_at: new Date(Date.UTC(2024, 0, 1) + (250 - i) * 3600_000).toISOString() }));
    const mapped = mapApplication({ ...application, status: 'converted' }, { jobStages: ['1'], history, sourceName: 'x'.repeat(100) });
    expect(mapped?.stageHistory).toHaveLength(200);
    expect(mapped?.outcome).toBeUndefined();
    expect(mapped?.origin).toHaveLength(60);
    const times = (mapped?.stageHistory ?? []).map((h) => Date.parse(h.enteredAt));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  const note = { id: 1, type: 'NOTE', candidate_id: 1, application_id: 4, user_id: 9, body: 'b', visibility: null, created_at: '2024-01-01T00:00:00Z' };
  it('notes: unknown authors drop the author, a missing visibility stays private, a foreign application drops the link', () => {
    expect(mapNote(note, new Set(['1']), true)).toEqual({ candidateRef: '1', applicationRef: '4', body: 'b', createdAt: '2024-01-01T00:00:00.000Z', private: true });
    expect(mapNote({ ...note, user_id: null }, new Set(), false)).not.toHaveProperty('applicationRef');
    expect(mapNote({ ...note, candidate_id: null }, new Set(), true)).toBeNull();
  });

  it('emails: addresses are read out of display names; without a match the message is outbound', () => {
    expect(addressesIn('Ada <ADA@x.com>, b@y.org')).toEqual(['ada@x.com', 'b@y.org']);
    expect(addressesIn(null)).toEqual([]);
    const email = { ...note, type: 'EMAIL', email_from: null, email_to: null, subject: '  ' };
    expect(mapEmail(email, new Set())).toMatchObject({ direction: 'outbound', applicationRef: '4' });
    expect(mapEmail(email, new Set())).not.toHaveProperty('from');
    expect(mapEmail({ ...email, application_id: null }, new Set())).toBeNull();
  });

  it('attachments: resumes, letters and plain files come across; offers and agreements do not', () => {
    const kind = (type: string) => fileKindOf({ id: 1, application_id: 1, type, filename: 'f', url: 'u' });
    expect([kind('resume'), kind('cover_letter'), kind('other'), kind('take_home_test'), kind('form_attachment')]).toEqual(['cv', 'cover_letter', 'other', 'other', 'other']);
    for (const dropped of ['offer_packet', 'offer_letter', 'signed_offer_letter', 'midfunnel_agreement', 'automated_agreement', 'new_type']) expect(kind(dropped)).toBeNull();
  });
});

describe('isLinkedInUrl', () => {
  it('accepts linkedin.com and its subdomains, never a URL that only mentions it', () => {
    expect(isLinkedInUrl('https://linkedin.com/in/ada')).toBe(true);
    expect(isLinkedInUrl('https://it.linkedin.com/in/ada')).toBe(true);
    expect(isLinkedInUrl('https://evil.example/?u=linkedin.com/in/ada')).toBe(false);
    expect(isLinkedInUrl('https://linkedin.com.evil.example/in/ada')).toBe(false);
    expect(isLinkedInUrl('not a url')).toBe(false);
  });
});
