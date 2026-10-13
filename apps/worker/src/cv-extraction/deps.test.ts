import { createInMemoryFileStorage } from '@tt/core/testing';
import type { Db } from '@tt/db';
import { describe, expect, it, vi } from 'vitest';
import { createCvExtractionDeps } from './deps.js';

const db = {} as Db;

describe('createCvExtractionDeps', () => {
  it('extracts only the plain text without FAST_MODEL', () => {
    const deps = createCvExtractionDeps({ db, files: createInMemoryFileStorage(), onModelError: vi.fn() });
    expect(deps.modelExtractor).toBeNull();
    expect(typeof deps.textExtractor.extractText).toBe('function');
  });

  it('carries the daily model budget when given', () => {
    expect(createCvExtractionDeps({ db, files: createInMemoryFileStorage(), modelDailyBudget: 7, onModelError: vi.fn() }).modelDailyBudget).toBe(7);
    expect(createCvExtractionDeps({ db, files: createInMemoryFileStorage(), onModelError: vi.fn() }).modelDailyBudget).toBeUndefined();
  });

  it('adds a model extractor when FAST_MODEL is set, and reports a failure by message only', async () => {
    const onModelError = vi.fn();
    const deps = createCvExtractionDeps({ db, files: createInMemoryFileStorage(), fastModel: 'unknown-provider/none', onModelError });
    expect(deps.modelExtractor).not.toBeNull();
    // Without a usable provider the extractor falls back to text only: `null` data, which core ignores.
    expect(await deps.modelExtractor!.extract('Sviluppatrice backend')).toBeNull();
    expect(onModelError).toHaveBeenCalledTimes(1);
    expect(typeof onModelError.mock.calls[0]?.[0]).toBe('string');
  });
});
