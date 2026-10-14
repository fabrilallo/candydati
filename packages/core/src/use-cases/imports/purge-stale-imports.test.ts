import { describe, expect, it } from 'vitest';
import { ORG_A } from '../../testing/index.js';
import { IMPORT_STALE_DAYS, purgeStaleImports } from './purge-stale-imports.js';
import { commit, GIULIA, GIULIA_ROW, importWorld, MARIO, MARIO_ROW, readyBatch } from './fixtures.js';

const DAY = 24 * 3600 * 1000;

describe('purgeStaleImports', () => {
  it('fails and purges a batch abandoned for more than N days, with its items, analysis and files', async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO], [MARIO_ROW]);
    const now = new Date(batch.createdAt.getTime() + (IMPORT_STALE_DAYS + 1) * DAY);
    expect(await purgeStaleImports(deps, { now, olderThanDays: IMPORT_STALE_DAYS })).toEqual({ purged: 1, failed: [] });
    expect(await deps.imports.findById(ORG_A, batch.id)).toMatchObject({ status: 'failed', error: 'expired', sourceFiles: [] });
    expect(deps.importStore.read().items).toEqual([]);
    expect(deps.importStore.read().analyses).toEqual([]);
    expect(deps.files.keys().filter((k) => k.includes('/imports/'))).toEqual([]);
    expect(await purgeStaleImports(deps, { now, olderThanDays: IMPORT_STALE_DAYS })).toEqual({ purged: 0, failed: [] });
  });

  it('leaves a recent batch and a committed one alone, and honours a configurable N', async () => {
    const deps = importWorld();
    const recent = await readyBatch(deps, [MARIO], [MARIO_ROW]);
    const done = await readyBatch(deps, [GIULIA], [GIULIA_ROW]);
    await commit(deps, done.id);
    const now = new Date(recent.createdAt.getTime() + 3 * DAY);
    expect(await purgeStaleImports(deps, { now, olderThanDays: IMPORT_STALE_DAYS })).toMatchObject({ purged: 0 });
    expect((await deps.imports.findById(ORG_A, recent.id))?.status).toBe('ready');
    expect(await purgeStaleImports(deps, { now, olderThanDays: 2 })).toMatchObject({ purged: 1 });
    expect((await deps.imports.findById(ORG_A, done.id))?.status).toBe('done');
  });

  it('finishes the purge of a failed batch that still holds its files', async () => {
    const deps = importWorld();
    const batch = await readyBatch(deps, [MARIO], [MARIO_ROW]);
    await deps.imports.transition(ORG_A, batch.id, 'ready', { status: 'failed', error: 'commit_failed' });
    const now = new Date(batch.createdAt.getTime() + 10 * DAY);
    expect(await purgeStaleImports(deps, { now, olderThanDays: 7 })).toMatchObject({ purged: 1 });
    expect(deps.importStore.read().items).toEqual([]);
  });
});
