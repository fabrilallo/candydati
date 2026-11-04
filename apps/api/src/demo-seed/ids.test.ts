import { describe, expect, it } from 'vitest';
import { demoId } from './ids.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('demoId', () => {
  it('is a stable uuid for the same organization and key', () => {
    expect(demoId('org_1', 'job:backend')).toBe(demoId('org_1', 'job:backend'));
    expect(demoId('org_1', 'job:backend')).toMatch(UUID);
  });

  it('differs across keys and organizations, so two seeded organizations never share a primary key', () => {
    expect(demoId('org_1', 'job:backend')).not.toBe(demoId('org_1', 'job:designer'));
    expect(demoId('org_1', 'job:backend')).not.toBe(demoId('org_2', 'job:backend'));
  });
});
