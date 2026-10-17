import { stripQuotedReply, type EmailTransportConfig } from '@candydati/providers';
import type { InboundEmail as ParsedEmail } from '@candydati/providers';
import type { InboundEmail } from '@candydati/core';

/** Cap of the raw body of an inbound webhook. */
export const INBOUND_BODY_LIMIT = 5 * 1024 * 1024;

/** The new text goes in `text`, the unstripped original in `rawText`. Nothing is rendered as HTML. */
export function toCoreInbound(parsed: ParsedEmail): InboundEmail {
  const stripped = stripQuotedReply(parsed.text);
  return {
    to: [...parsed.to],
    from: parsed.from,
    subject: parsed.subject,
    text: stripped,
    ...(parsed.text !== stripped ? { rawText: parsed.text } : {}),
    ...(parsed.html ? { html: parsed.html } : {}),
    messageId: parsed.messageId,
    ...(parsed.inReplyTo ? { inReplyTo: parsed.inReplyTo } : {}),
    receivedAt: parsed.receivedAt,
  };
}

/** The Resend API key of the settings in force (environment or app), to fetch the content of an inbound email. */
export const resendApiKey = (email: { readonly transport: EmailTransportConfig | null }): string | undefined =>
  email.transport?.kind === 'resend' ? email.transport.apiKey : undefined;
