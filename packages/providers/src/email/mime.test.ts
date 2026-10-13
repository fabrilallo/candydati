import { describe, expect, it } from 'vitest';
import { InboundParseError } from './inbound.js';
import { parseRawMime, RAW_MIME_MAX_BYTES } from './mime.js';

const bytes = (value: string): Uint8Array => Buffer.from(value.replace(/\n/g, '\r\n'));

const base = 'From: Mario <mario@example.com>\nTo: reply+tok12345678@in.example.com\nSubject: Re: Colloquio\nMessage-ID: <abc@mail.example.com>\nIn-Reply-To: <orig@x>\nDate: Tue, 03 Mar 2026 10:00:00 +0000\n';

describe('parseRawMime', () => {
  it('parses a plain text message', async () => {
    const email = await parseRawMime(bytes(`${base}Content-Type: text/plain; charset=utf-8\n\nCiao a tutti\n`));
    expect(email).toMatchObject({
      to: ['reply+tok12345678@in.example.com'], from: 'mario@example.com', subject: 'Re: Colloquio',
      messageId: '<abc@mail.example.com>', inReplyTo: '<orig@x>', receivedAt: new Date('2026-03-03T10:00:00Z'),
    });
    expect(email.text.trim()).toBe('Ciao a tutti');
    expect(email.html).toBeUndefined();
  });
  it('derives text from html when text is missing', async () => {
    const email = await parseRawMime(bytes(`${base}Content-Type: text/html\n\n<p>Solo <b>html</b></p>\n`));
    expect(email.text).toBe('Solo html');
    expect(email.html).toContain('<b>html</b>');
  });
  it('ignores attachments and keeps the text part', async () => {
    const mime = `${base}Content-Type: multipart/mixed; boundary=BB\n\n--BB\nContent-Type: text/plain\n\nTesto\n--BB\nContent-Type: application/pdf; name=cv.pdf\nContent-Disposition: attachment; filename=cv.pdf\nContent-Transfer-Encoding: base64\n\nJVBERi0xLjQ=\n--BB--\n`;
    const email = await parseRawMime(bytes(mime));
    expect(email.text.trim()).toBe('Testo');
    expect(JSON.stringify(email)).not.toContain('JVBER');
  });
  it('defaults the date and handles missing subject', async () => {
    const now = new Date('2030-01-01T00:00:00Z');
    const email = await parseRawMime(bytes('From: a@x.io\nTo: b@y.io\nMessage-ID: <1@x>\n\nhi\n'), now);
    expect(email.receivedAt).toEqual(now);
    expect(email.subject).toBe('');
  });
  it('rejects oversized and incomplete messages', async () => {
    await expect(parseRawMime(new Uint8Array(RAW_MIME_MAX_BYTES + 1))).rejects.toThrow(InboundParseError);
    await expect(parseRawMime(bytes('From: a@x.io\nSubject: x\n\nhi'))).rejects.toThrow(InboundParseError);
    await expect(parseRawMime(bytes('To: b@y.io\nMessage-ID: <1@x>\n\nhi'))).rejects.toThrow(InboundParseError);
  });
});
