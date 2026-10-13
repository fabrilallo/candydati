import { describe, expect, it } from 'vitest';
import { CONVERSATION_TOKEN_PATTERN, emailSettingsInputSchema } from './message.js';
import { emailTemplateInputSchema } from './template.js';

describe('emailTemplateInputSchema', () => {
  const valid = { name: ' Ok ', kind: 'custom', subject: 'S', body: 'B' };
  it('trims and accepts valid input', () => {
    expect(emailTemplateInputSchema.parse(valid)).toEqual({ name: 'Ok', kind: 'custom', subject: 'S', body: 'B' });
  });
  it.each([
    { name: '' },
    { name: 'a'.repeat(81) },
    { kind: 'other' },
    { subject: ' ' },
    { subject: 'a'.repeat(201) },
    { body: '' },
    { body: 'a'.repeat(10_001) },
  ])('rejects %j', (override) => {
    expect(emailTemplateInputSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });
});

describe('emailSettingsInputSchema', () => {
  it('lowercases the address and allows null', () => {
    expect(emailSettingsInputSchema.parse({ senderName: 'Acme', fromAddress: 'HR@Acme.COM' }).fromAddress).toBe('hr@acme.com');
    expect(emailSettingsInputSchema.parse({ senderName: 'Acme', fromAddress: null }).fromAddress).toBeNull();
    expect(emailSettingsInputSchema.safeParse({ senderName: '', fromAddress: null }).success).toBe(false);
    expect(emailSettingsInputSchema.safeParse({ senderName: 'A', fromAddress: 'nope' }).success).toBe(false);
  });
});

describe('CONVERSATION_TOKEN_PATTERN', () => {
  it('accepts base32 lowercase of 24+ chars only', () => {
    expect(CONVERSATION_TOKEN_PATTERN.test('abcdefghijklmnopqrstuvwx')).toBe(true);
    expect(CONVERSATION_TOKEN_PATTERN.test('a'.repeat(23))).toBe(false);
    expect(CONVERSATION_TOKEN_PATTERN.test('A'.repeat(24))).toBe(false);
    expect(CONVERSATION_TOKEN_PATTERN.test('1'.repeat(24))).toBe(false);
  });
});
