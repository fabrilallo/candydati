import { schema, eq } from '@tt/db';
import { signHmacPayload } from '@tt/providers';
import type { FastifyInstance } from 'fastify';
import type { TestApp } from './test-app.js';
import { WEBHOOK_SECRET } from './test-app.js';

/** Unix seconds taken once: every request of a test run is signed and sent with the same, fresh timestamp. */
export const TIMESTAMP = String(Math.floor(Date.now() / 1000));

export const sign = (body: string | Buffer, secret = WEBHOOK_SECRET, timestamp = TIMESTAMP): string => signHmacPayload(body, timestamp, secret);

export interface MimeOptions {
  readonly token: string;
  readonly from: string;
  readonly messageId?: string;
  readonly subject?: string;
  readonly text?: string;
}

export const QUOTED = '> Gentile Giulia, la contattiamo presto.\n> Il team';

/** A reply as a mail client sends it: new text, then an attribution line and the quoted history. */
export function rawReply({ token, from, messageId = `<${Math.random().toString(36).slice(2)}@client.example>`, subject = 'Re: Candidatura', text = 'Grazie, sono disponibile giovedì.' }: MimeOptions): string {
  return [
    `From: ${from}`,
    `To: reply+${token}@in.test.example`,
    `Subject: ${subject}`,
    `Message-ID: ${messageId}`,
    'Date: Tue, 13 Oct 2026 10:00:00 +0000',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    text,
    '',
    'Il giorno 13 ott 2026 alle 09:00 Acme <jobs@mail.test.example> ha scritto:',
    QUOTED,
    '',
  ].join('\r\n');
}

export const postRaw = (app: FastifyInstance, body: string, signature: string | undefined, timestamp: string | null = TIMESTAMP) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/inbound/email/raw',
    headers: { 'content-type': 'message/rfc822', ...(signature ? { 'x-tt-signature': signature } : {}), ...(timestamp ? { 'x-tt-timestamp': timestamp } : {}) },
    payload: body,
  });

/** The conversation token of an application: the secret part of its reply address. */
export async function tokenOf(t: TestApp, applicationId: string): Promise<string> {
  const [row] = await t.handle.db.select().from(schema.conversation).where(eq(schema.conversation.applicationId, applicationId));
  if (!row) throw new Error('no conversation');
  return row.token;
}
