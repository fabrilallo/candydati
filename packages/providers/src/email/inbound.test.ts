import { describe, expect, it, vi } from 'vitest';
import { fetchResendReceivedContent, InboundParseError, parseResendInbound } from './inbound.js';

const event = {
  type: 'email.received',
  created_at: '2026-02-22T23:41:12.126Z',
  data: {
    email_id: 'e-1',
    created_at: '2026-02-22T23:41:11.894719+00:00',
    from: 'Mario Rossi <Mario@Example.com>',
    to: ['Team <reply+tok12345678@in.example.com>'],
    subject: 'Re: Colloquio',
    message_id: '<m1@mail.example.com>',
    attachments: [{ id: 'a', filename: 'x.png', content_type: 'image/png' }],
  },
};

describe('parseResendInbound', () => {
  it('normalizes metadata and body fetched separately', () => {
    const email = parseResendInbound(event, { text: 'Ciao', html: '<p>Ciao</p>', headers: { 'In-Reply-To': '<o@x>' } });
    expect(email).toEqual({
      to: ['reply+tok12345678@in.example.com'], from: 'Mario@Example.com', subject: 'Re: Colloquio', text: 'Ciao',
      html: '<p>Ciao</p>', messageId: '<m1@mail.example.com>', inReplyTo: '<o@x>', receivedAt: new Date('2026-02-22T23:41:11.894Z'),
    });
  });
  it('accepts inline text and header arrays; derives text from html', () => {
    const payload = { ...event, data: { ...event.data, text: '', html: '<p>Solo html</p>', headers: [{ name: 'in-reply-to', value: '<z@x>' }] } };
    const email = parseResendInbound(payload);
    expect(email.text).toBe('Solo html');
    expect(email.inReplyTo).toBe('<z@x>');
  });
  it('falls back to a synthetic message id and empty text/subject', () => {
    const { message_id: _ignored, subject: _s, ...rest } = event.data;
    const email = parseResendInbound({ ...event, data: rest });
    expect(email.messageId).toBe('resend:e-1');
    expect(email.subject).toBe('');
    expect(email.text).toBe('');
    expect(email.html).toBeUndefined();
    expect(email.inReplyTo).toBeUndefined();
  });
  it.each([null, {}, { ...event, type: 'email.sent' }, { ...event, data: { ...event.data, to: [] } }, { ...event, data: { ...event.data, created_at: 'nope' } }])(
    'rejects invalid payload %#', (payload) => {
      expect(() => parseResendInbound(payload)).toThrow(InboundParseError);
    },
  );
});

describe('fetchResendReceivedContent', () => {
  it('reads content by id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'T', html: null, headers: { a: 'b' } })));
    const result = await fetchResendReceivedContent('e/1', { apiKey: 'k', fetch: fetchMock });
    expect(result.text).toBe('T');
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('https://api.resend.com/emails/receiving/e%2F1');
  });
  it('fails safely', async () => {
    await expect(fetchResendReceivedContent('e', { apiKey: 'k', fetch: async () => new Response('x', { status: 503 }) })).rejects.toMatchObject({ transient: true });
    await expect(fetchResendReceivedContent('e', { apiKey: 'k', fetch: async () => { throw new Error('x'); } })).rejects.toMatchObject({ transient: true });
    await expect(fetchResendReceivedContent('e', { apiKey: 'k', fetch: async () => new Response('{"text":5}') })).rejects.toThrow(InboundParseError);
  });
});
