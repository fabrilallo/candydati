import { describe, expect, it } from 'vitest';
import { dataExportSchema, erasedSchema, processingRecordSchema, retentionOverviewSchema } from './privacy.js';

describe('privacy wire schemas', () => {
  it('reads the retention overview as the api sends it', () => {
    const parsed = retentionOverviewSchema.parse({
      upcoming: [{ applicationId: 'a', candidateId: 'c', candidateName: 'Marta Verdi', jobTitle: '', retentionExpiresAt: '2026-10-25T10:00:00.000Z' }],
      lastRuns: [{ id: 'r', startedAt: '2026-10-13T01:00:00.000Z', warned: 2, erased: 1 }],
    });
    expect(parsed.upcoming[0]?.candidateName).toBe('Marta Verdi');
  });

  it('reads exports and the processing record with configured providers', () => {
    expect(dataExportSchema.parse({ id: 'e', status: 'ready', sizeBytes: null, createdAt: '2026-10-13T09:00:00.000Z', completedAt: null, expiresAt: '2026-10-20T09:00:00.000Z' }).status).toBe('ready');
    const record = processingRecordSchema.parse({
      organization: { name: 'Acme', contactEmail: null },
      privacyNoticeVersion: null,
      retentionDays: null,
      providers: { storage: 's3', email: 'smtp', model: null },
      generatedAt: '2026-10-13T10:00:00.000Z',
    });
    expect(record.providers.model).toBeNull();
    expect(() => processingRecordSchema.parse({ ...record, providers: [] })).toThrow();
  });

  it('accepts only erased: true', () => {
    expect(erasedSchema.parse({ erased: true })).toEqual({ erased: true });
    expect(() => erasedSchema.parse({ erased: false })).toThrow();
  });
});
