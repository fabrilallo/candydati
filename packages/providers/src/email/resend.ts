import { z } from 'zod';
import { buildHeaders } from './headers.js';
import {
  EmailSendError,
  type DnsRecord,
  type DomainStatus,
  type DomainVerification,
  type EmailProvider,
  type FetchLike,
} from './types.js';

const BASE_URL = 'https://api.resend.com';

export interface ResendOptions {
  readonly apiKey: string;
  readonly fetch?: FetchLike | undefined;
}

const sendResponse = z.object({ id: z.string().min(1) });
const domainSummary = z.object({ id: z.string(), name: z.string(), status: z.string().optional() });
const domainList = z.object({ data: z.array(domainSummary) });
const domainDetail = z.object({
  id: z.string(),
  name: z.string().optional(),
  status: z.string(),
  records: z.array(z.object({ type: z.string(), name: z.string(), value: z.string() })).default([]),
});

/** Maps Resend domain statuses to the provider-neutral ones. */
export function mapResendDomainStatus(status: string): DomainVerification {
  if (status === 'verified') return 'verified';
  if (status === 'failed' || status === 'temporary_failure') return 'failed';
  return 'pending';
}

function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export function createResendEmailProvider(options: ResendOptions): EmailProvider {
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));

  async function call(method: string, path: string, body?: unknown, extraHeaders: Readonly<Record<string, string>> = {}): Promise<unknown> {
    let response: Response;
    try {
      response = await doFetch(`${BASE_URL}${path}`, {
        method,
        headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json', ...extraHeaders },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new EmailSendError('Resend request failed', true);
    }
    if (!response.ok) throw new EmailSendError(`Resend responded ${response.status}`, isTransientStatus(response.status));
    return response.json();
  }

  async function findOrCreateDomain(name: string): Promise<string> {
    const listed = domainList.parse(await call('GET', '/domains'));
    const existing = listed.data.find((domain) => domain.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    return domainSummary.parse(await call('POST', '/domains', { name })).id;
  }

  return {
    deduplicates: true,
    async send(message) {
      const headers = buildHeaders(message);
      const payload = {
        from: message.from,
        to: [...message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      };
      const idempotency = message.idempotencyKey ? { 'Idempotency-Key': message.idempotencyKey } : {};
      const parsed = sendResponse.safeParse(await call('POST', '/emails', payload, idempotency));
      if (!parsed.success) throw new EmailSendError('Unexpected Resend response', false);
      return { providerMessageId: parsed.data.id };
    },
    async domainStatus(domain): Promise<DomainStatus> {
      const id = await findOrCreateDomain(domain);
      const detail = domainDetail.parse(await call('GET', `/domains/${encodeURIComponent(id)}`));
      const records: DnsRecord[] = detail.records.map(({ type, name, value }) => ({ type, name, value }));
      return { status: mapResendDomainStatus(detail.status), records };
    },
  };
}
