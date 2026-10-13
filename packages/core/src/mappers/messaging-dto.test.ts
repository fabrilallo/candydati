import { describe, expect, it } from 'vitest';
import { toEmailSettingsDto, toEmailTemplateDto } from './messaging-dto.js';

describe('messaging DTO mappers', () => {
  it('maps a template, with null updatedAt for an untouched default', () => {
    const base = { id: 'default:receipt', name: 'n', kind: 'receipt', subject: 's', body: 'b', isDefault: true, updatedAt: null } as const;
    expect(toEmailTemplateDto(base)).toEqual(base);
    expect(toEmailTemplateDto({ ...base, isDefault: false, updatedAt: new Date('2026-01-01T00:00:00Z') }).updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('maps settings as they are', () => {
    const view = { senderName: 'A', fromAddress: null, domain: null, effectiveFrom: '"A" <a@b.c>' };
    expect(toEmailSettingsDto(view)).toEqual(view);
  });
});
