import { afterEach, describe, expect, it } from 'vitest';
import { JsonReaderError } from '../../../http/index.js';
import { exampleCandidate, workableAccount } from '../../../testing/workable-account.js';
import { startWorkable, workableBuilder, type WorkableHarness } from '../../../testing/workable-harness.js';
import { createWorkableClient } from './client.js';
import { importWorkable } from './run.js';

let harness: WorkableHarness | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

const TOKEN = 'wk_test_token_123456';
const NOW = new Date('2026-10-16T10:00:00Z');
const LONG_ID = 'x'.repeat(130);

describe('importWorkable, edge cases', () => {
  it('skips a candidate Workable no longer has, or one the package refuses, counts it, and goes on', async () => {
    harness = await startWorkable(() =>
      workableAccount({
        extraListed: ['gone', LONG_ID],
        candidates: { '108d1748': exampleCandidate({}), ce4da98: exampleCandidate({ id: 'ce4da98' }), [LONG_ID]: exampleCandidate({ id: LONG_ID }) },
      }),
    );
    const { builder, manifest } = workableBuilder();
    const stats = await importWorkable(createWorkableClient(harness.reader, harness.baseUrl, TOKEN), builder, async () => undefined, NOW);
    expect(stats).toMatchObject({ candidates: 2, skippedCandidates: 2 });
    expect(manifest().applications?.map((a) => a.ref)).toEqual(['ce4da98', '108d1748']);
  });

  it('treats a candidate without an activity stream as having no history', async () => {
    harness = await startWorkable(() => (url) => {
      const reply = workableAccount({ candidates: { '108d1748': exampleCandidate({}), ce4da98: exampleCandidate({ id: 'ce4da98' }) } })(url, {} as never);
      return url.pathname.endsWith('/activities') ? { status: 404, body: { error: 'Not found' } } : reply;
    });
    const { builder, manifest } = workableBuilder();
    const stats = await importWorkable(createWorkableClient(harness.reader, harness.baseUrl, TOKEN), builder, async () => undefined, NOW);
    expect(stats.candidates).toBe(2);
    expect(manifest().applications?.[0]?.stageHistory).toHaveLength(1);
  });

  it('stops on an error that is not about one candidate: the credentials, here', async () => {
    harness = await startWorkable(() => (url) => (url.pathname.endsWith('/members') ? { status: 403, body: { error: 'Forbidden' } } : undefined));
    const { builder } = workableBuilder();
    await expect(importWorkable(createWorkableClient(harness.reader, harness.baseUrl, TOKEN), builder, async () => undefined, NOW)).rejects.toEqual(new JsonReaderError('credentials_refused', 403));
  });

  it('skips a CV that is too large, a CV link that is not a link, and keeps the candidate', async () => {
    harness = await startWorkable((origin) =>
      workableAccount({
        candidates: { '108d1748': exampleCandidate({ resume_url: `${origin}/files/huge.pdf` }), ce4da98: exampleCandidate({ id: 'ce4da98', resume_url: 'javascript:alert(1)' }) },
        files: { '/files/huge.pdf': { raw: new Uint8Array(2048) } },
      }),
    );
    const { builder, keys } = workableBuilder({ maxFileBytes: 1024 });
    const stats = await importWorkable(createWorkableClient(harness.reader, harness.baseUrl, TOKEN), builder, async () => undefined, NOW);
    expect(stats).toMatchObject({ candidates: 2, files: 0, skippedFiles: 1 });
    expect(keys()).toEqual([]);
  });
});
