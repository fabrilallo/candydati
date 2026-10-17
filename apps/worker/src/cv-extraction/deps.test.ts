import { createInMemoryFileStorage } from '@candydati/core/testing';
import type { Db } from '@candydati/db';
import { describe, expect, it, vi } from 'vitest';
import { createCvExtractionDeps } from './deps.js';
import { createDrizzleUnitOfWork } from '@candydati/core';

const db = {} as Db;
const off = () => null;

describe('createCvExtractionDeps', () => {
  it('extracts only the plain text while the fast model is off', () => {
    const deps = createCvExtractionDeps({ uow: createDrizzleUnitOfWork(db), files: createInMemoryFileStorage(), fastModel: off, onModelError: vi.fn() });
    expect(deps.modelExtractor).toBeNull();
    expect(typeof deps.textExtractor.extractText).toBe('function');
  });

  it('carries the daily model budget when given', () => {
    expect(createCvExtractionDeps({ uow: createDrizzleUnitOfWork(db), files: createInMemoryFileStorage(), fastModel: off, modelDailyBudget: 7, onModelError: vi.fn() }).modelDailyBudget).toBe(7);
    expect(createCvExtractionDeps({ uow: createDrizzleUnitOfWork(db), files: createInMemoryFileStorage(), fastModel: off, onModelError: vi.fn() }).modelDailyBudget).toBeUndefined();
  });

  it('follows the fast model switched on and off without a restart', () => {
    let model: { id: `${string}/${string}` } | null = null;
    const deps = createCvExtractionDeps({ uow: createDrizzleUnitOfWork(db), files: createInMemoryFileStorage(), fastModel: () => model, onModelError: vi.fn() });
    expect(deps.modelExtractor).toBeNull();
    model = { id: 'unknown-provider/none' };
    expect(deps.modelExtractor).not.toBeNull();
    model = null;
    expect(deps.modelExtractor).toBeNull();
  });

  it('adds a model extractor while a fast model is on, and reports a failure by message only', async () => {
    const onModelError = vi.fn();
    const deps = createCvExtractionDeps({ uow: createDrizzleUnitOfWork(db), files: createInMemoryFileStorage(), fastModel: () => ({ id: 'unknown-provider/none' }), onModelError });
    expect(deps.modelExtractor).not.toBeNull();
    // Without a usable provider the extractor falls back to text only: `null` data, which core ignores.
    expect(await deps.modelExtractor!.extract('Sviluppatrice backend')).toBeNull();
    expect(onModelError).toHaveBeenCalledTimes(1);
    expect(typeof onModelError.mock.calls[0]?.[0]).toBe('string');
  });
});
