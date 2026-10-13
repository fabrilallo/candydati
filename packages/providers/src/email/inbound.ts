import { z } from 'zod';
import { bareAddress } from './address.js';
import { htmlToText } from './html-text.js';
import { EmailSendError, type FetchLike, type InboundEmail } from './types.js';

const headerMap = z.union([
  z.record(z.string(), z.string()),
  z.array(z.object({ name: z.string(), value: z.string() })).transform((items) =>
    Object.fromEntries(items.map((item) => [item.name, item.value])),
  ),
]);

const content = z.object({
  text: z.string().nullish(),
  html: z.string().nullish(),
  headers: headerMap.nullish(),
});

const metadata = z.object({
  email_id: z.string().min(1),
  created_at: z.coerce.date(),
  from: z.string().min(1),
  to: z.array(z.string()).min(1),
  subject: z.string().nullish(),
  message_id: z.string().min(1).nullish(),
});

const dataSchema = metadata.extend(content.shape);
const eventSchema = z.object({ type: z.literal('email.received'), data: dataSchema });

export type ResendReceivedContent = z.infer<typeof content>;

export class InboundParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InboundParseError';
  }
}

function headerOf(headers: Readonly<Record<string, string>> | null | undefined, name: string): string | undefined {
  const key = Object.keys(headers ?? {}).find((candidate) => candidate.toLowerCase() === name);
  const value = key === undefined ? undefined : headers?.[key];
  return value?.trim() ? value.trim() : undefined;
}

/**
 * Normalizes a Resend `email.received` webhook event. The webhook carries metadata only: pass the body fetched with
 * `fetchResendReceivedContent` as `received`. A payload that already includes text/html is accepted too.
 */
export function parseResendInbound(payload: unknown, received?: ResendReceivedContent): InboundEmail {
  const parsed = eventSchema.safeParse(payload);
  if (!parsed.success) throw new InboundParseError('Invalid Resend inbound payload');
  const data = parsed.data.data;
  const extra = received === undefined ? undefined : content.parse(received);
  const html = extra?.html ?? data.html ?? undefined;
  const rawText = extra?.text ?? data.text ?? '';
  const headers = extra?.headers ?? data.headers;
  const inReplyTo = headerOf(headers, 'in-reply-to');
  return {
    to: data.to.map(bareAddress),
    from: bareAddress(data.from),
    subject: data.subject ?? '',
    text: rawText.trim() === '' && html ? htmlToText(html) : rawText,
    ...(html ? { html } : {}),
    messageId: data.message_id ?? `resend:${data.email_id}`,
    ...(inReplyTo ? { inReplyTo } : {}),
    receivedAt: data.created_at,
  };
}

/** Reads the body of a received email (text, html, headers) from the Resend API by id. */
export async function fetchResendReceivedContent(
  emailId: string,
  options: { readonly apiKey: string; readonly fetch?: FetchLike | undefined },
): Promise<ResendReceivedContent> {
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  let response: Response;
  try {
    response = await doFetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
      headers: { authorization: `Bearer ${options.apiKey}` },
    });
  } catch {
    throw new EmailSendError('Resend request failed', true);
  }
  if (!response.ok) throw new EmailSendError(`Resend responded ${response.status}`, response.status >= 500 || response.status === 429);
  const parsed = content.safeParse(await response.json());
  if (!parsed.success) throw new InboundParseError('Invalid Resend received email');
  return parsed.data;
}
