import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import { describe, expect, it } from 'vitest';
import { createSmtpEmailProvider } from './smtp.js';
import { EmailSendError } from './types.js';

const SMTP_PORT = Number(process.env['SMTP_PORT'] ?? 1025);
const API = process.env['MAILPIT_API'] ?? 'http://localhost:8025';

function reachable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: 'localhost', port, timeout: 1000 });
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => (socket.destroy(), resolve(false)));
  });
}

const up = (await reachable(SMTP_PORT)) && (await reachable(8025));

describe.skipIf(!up)('smtp provider against Mailpit', () => {
  const provider = createSmtpEmailProvider({ host: 'localhost', port: SMTP_PORT, secure: false });

  it('delivers a message with custom headers and reads it back via the REST API', async () => {
    const subject = `it-${randomUUID()}`;
    const result = await provider.send({
      from: 'Team <noreply@localhost>', replyTo: 'reply+tok12345678@inbound.localhost', to: ['cand@example.com'],
      subject, text: 'Corpo del messaggio', html: '<p>Corpo</p>',
      headers: { 'Auto-Submitted': 'auto-generated', 'In-Reply-To': '<prev@x>', References: '<prev@x>' },
    });
    expect(result.providerMessageId).toBeTruthy();
    const search = await fetch(`${API}/api/v1/search?query=${encodeURIComponent(`subject:"${subject}"`)}`);
    const found = (await search.json()) as { messages: { ID: string }[] };
    expect(found.messages).toHaveLength(1);
    const detail = (await (await fetch(`${API}/api/v1/message/${found.messages[0]?.ID}`)).json()) as {
      Text: string; ReplyTo: { Address: string }[]; To: { Address: string }[];
    };
    expect(detail.Text.trim()).toBe('Corpo del messaggio');
    expect(detail.ReplyTo[0]?.Address).toBe('reply+tok12345678@inbound.localhost');
    expect(detail.To[0]?.Address).toBe('cand@example.com');
    const headers = (await (await fetch(`${API}/api/v1/message/${found.messages[0]?.ID}/headers`)).json()) as Record<string, string[]>;
    expect(headers['Auto-Submitted']).toEqual(['auto-generated']);
    expect(headers['In-Reply-To']).toEqual(['<prev@x>']);
    expect(headers['References']).toEqual(['<prev@x>']);
  });

  it('reports domains as unsupported', async () => {
    expect(await provider.domainStatus('localhost')).toEqual({ status: 'unsupported', records: [] });
  });
});

describe('smtp provider failures', () => {
  it('raises a transient, redacted error when the server is down', async () => {
    const down = createSmtpEmailProvider({ host: '127.0.0.1', port: 1, secure: false, user: 'u', password: 'p' });
    const error = await down.send({ from: 'a@x.io', to: ['secret@y.io'], subject: 's', text: 't' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailSendError);
    expect((error as EmailSendError).transient).toBe(true);
    expect((error as Error).message).not.toContain('secret@y.io');
  });
});
