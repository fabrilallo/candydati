import { createTransport } from 'nodemailer';
import { buildHeaders } from './headers.js';
import { EmailSendError, type EmailProvider } from './types.js';

export interface SmtpOptions {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly user?: string | undefined;
  readonly password?: string | undefined;
}

const TRANSIENT_CODES = new Set(['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNRESET', 'EDNS']);

function isTransient(error: unknown): boolean {
  const { code, responseCode } = error as { code?: unknown; responseCode?: unknown };
  if (typeof responseCode === 'number') return responseCode >= 400 && responseCode < 500;
  return typeof code === 'string' && TRANSIENT_CODES.has(code);
}

export function createSmtpEmailProvider(options: SmtpOptions): EmailProvider {
  const transport = createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    ...(options.user ? { auth: { user: options.user, pass: options.password ?? '' } } : {}),
  });
  return {
    async send(message) {
      try {
        const info = await transport.sendMail({
          from: message.from,
          to: [...message.to],
          subject: message.subject,
          text: message.text,
          ...(message.replyTo ? { replyTo: message.replyTo } : {}),
          ...(message.html ? { html: message.html } : {}),
          headers: buildHeaders(message),
        });
        return { providerMessageId: info.messageId };
      } catch (error) {
        // The transport error can echo addresses: only the class of failure leaves this module.
        throw new EmailSendError('SMTP send failed', isTransient(error));
      }
    },
    async domainStatus() {
      return { status: 'unsupported', records: [] };
    },
  };
}
