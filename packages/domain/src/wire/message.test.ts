import { describe, expect, it } from 'vitest';
import { emailSettingsSchema, messageSchema, sendResultSchema } from './message.js';

describe('message wire schemas', () => {
  it('reads a message sent by the system and the sending state', () => {
    const base = { id: 'm', direction: 'outbound', subject: 's', bodyText: 'b', status: 'sending', sentBy: { id: 'system', name: 'system' }, createdAt: '2026-10-10T09:00:00.000Z', sentAt: null, unverifiedSender: false, error: null };
    expect(messageSchema.parse(base).status).toBe('sending');
    expect(() => messageSchema.parse({ ...base, status: 'x' })).toThrow();
  });

  it('reads email settings and the send result', () => {
    expect(emailSettingsSchema.parse({ senderName: 'A', fromAddress: null, domain: null, effectiveFrom: 'a@b.c' }).domain).toBeNull();
    expect(sendResultSchema.parse({ queued: 2, failed: 1 }).failed).toBe(1);
  });
});
