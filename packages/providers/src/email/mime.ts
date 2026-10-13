import { simpleParser, type AddressObject } from 'mailparser';
import { bareAddress } from './address.js';
import { htmlToText } from './html-text.js';
import { InboundParseError } from './inbound.js';
import type { InboundEmail } from './types.js';

export const RAW_MIME_MAX_BYTES = 5 * 1024 * 1024;

function addresses(field: AddressObject | AddressObject[] | undefined): string[] {
  const objects = field === undefined ? [] : Array.isArray(field) ? field : [field];
  return objects.flatMap((object) => object.value.map((entry) => entry.address ?? '')).filter((a) => a !== '');
}

/** Parses a raw RFC 5322 message. Attachments are ignored; only text (or text derived from html) is kept. */
export async function parseRawMime(bytes: Uint8Array, now: Date = new Date()): Promise<InboundEmail> {
  if (bytes.byteLength > RAW_MIME_MAX_BYTES) throw new InboundParseError('Raw email too large');
  const parsed = await simpleParser(Buffer.from(bytes), { skipImageLinks: true }).catch(() => {
    throw new InboundParseError('Invalid raw email');
  });
  const from = addresses(parsed.from)[0];
  const to = addresses(parsed.to);
  if (!from || to.length === 0 || !parsed.messageId) throw new InboundParseError('Raw email misses from, to or message-id');
  const html = typeof parsed.html === 'string' && parsed.html !== '' ? parsed.html : undefined;
  const text = (parsed.text ?? '').trim() === '' && html ? htmlToText(html) : (parsed.text ?? '');
  return {
    to: to.map(bareAddress),
    from,
    subject: parsed.subject ?? '',
    text,
    ...(html ? { html } : {}),
    messageId: parsed.messageId,
    ...(parsed.inReplyTo ? { inReplyTo: parsed.inReplyTo } : {}),
    receivedAt: parsed.date ?? now,
  };
}
