import { describe, expect, it } from 'vitest';
import { CANDIDATE_EXPORT_SCHEMA_ID, candidateExportJsonSchema, candidateExportSchema } from './export.js';
import { candidateCorrectionSchema } from './correction.js';
import { dataExportKey, RETENTION_WARNING_DAYS } from './retention.js';

const iso = '2026-06-01T10:00:00.000Z';
const valid = {
  schemaVersion: 1,
  exportedAt: iso,
  candidate: { id: 'c', firstName: 'Ada', lastName: 'L', email: 'a@x.it', phone: null, linkedinUrl: null, tags: [], talentPool: false, retentionExpiresAt: iso, createdAt: iso, updatedAt: iso },
  applications: [],
  notes: [],
};

describe('candidateExportSchema', () => {
  it('accepts a complete export and rejects another version', () => {
    expect(candidateExportSchema.safeParse(valid).success).toBe(true);
    expect(candidateExportSchema.safeParse({ ...valid, schemaVersion: 2 }).success).toBe(false);
    expect(candidateExportSchema.safeParse({ ...valid, exportedAt: 'yesterday' }).success).toBe(false);
  });

  it('has a versioned JSON schema that is deterministic', () => {
    const schema = candidateExportJsonSchema();
    expect(schema.$id).toBe(CANDIDATE_EXPORT_SCHEMA_ID);
    expect(schema.$schema).toEqual(expect.stringContaining('json-schema.org'));
    expect(schema).toHaveProperty('properties.applications');
    expect(JSON.stringify(candidateExportJsonSchema())).toBe(JSON.stringify(schema));
  });
});

describe('candidateCorrectionSchema', () => {
  it('needs at least one field and lowercases the email', () => {
    expect(candidateCorrectionSchema.safeParse({}).success).toBe(false);
    expect(candidateCorrectionSchema.parse({ email: 'ADA@X.IT' })).toEqual({ email: 'ada@x.it' });
  });

  it('lets phone and LinkedIn be cleared with null and refuses a bad phone', () => {
    expect(candidateCorrectionSchema.parse({ phone: null })).toEqual({ phone: null });
    expect(candidateCorrectionSchema.safeParse({ phone: 'abc' }).success).toBe(false);
    expect(candidateCorrectionSchema.safeParse({ firstName: '  ' }).success).toBe(false);
  });
});

describe('retention constants', () => {
  it('warns 30 days ahead and keys exports by organization', () => {
    expect(RETENTION_WARNING_DAYS).toBe(30);
    expect(dataExportKey('o', 'e')).toBe('organizations/o/exports/e.zip');
  });
});
