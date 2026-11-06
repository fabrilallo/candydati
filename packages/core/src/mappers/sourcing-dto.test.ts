import { describe, expect, it } from 'vitest';
import type { SourcedContact } from '@candydati/domain';
import { toSourcedContactDto } from './sourcing-dto.js';

describe('sourced contact DTO', () => {
  it('never carries the notice hash or the organization', () => {
    const contact: SourcedContact = {
      id: 'c1', organizationId: 'org_a', jobId: 'job_1', firstName: 'Maja', lastName: null, headline: null, location: null, source: 'web', profileUrl: 'https://maja.dev',
      profileKey: 'maja.dev', email: null, evidence: [], status: 'found', noticeTokenHash: 'SECRET-HASH', noticeSentAt: null, contactedAt: null,
      expiresAt: new Date('2026-12-06T00:00:00Z'), createdBy: 'u1', createdAt: new Date('2026-11-06T00:00:00Z'),
    };
    const dto = toSourcedContactDto(contact);
    expect(JSON.stringify(dto)).not.toContain('SECRET-HASH');
    expect(dto).not.toHaveProperty('organizationId');
    expect(dto.expiresAt).toBe('2026-12-06T00:00:00.000Z');
  });
});
