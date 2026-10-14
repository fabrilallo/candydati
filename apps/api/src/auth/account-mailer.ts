import type { EmailSender } from '@tt/core';
import { buildAccountEmail, type AccountEmailInput, type AccountEmailKind } from '@tt/domain';

/**
 * Account emails (verify, reset, invitation, failed sign-ins) through the configured EmailProvider. Sending is
 * fire-and-forget: the HTTP answer never waits for the provider, so its timing does not tell whether an address has an
 * account. Failures are reported with the kind only: never the address, never the link (it works like a password).
 */
export interface AccountMailer {
  send(to: string, email: AccountEmailInput): void;
}

export interface AccountMailerDeps {
  readonly sender: EmailSender;
  readonly platformName: string;
  /** `EMAIL_FROM_LOCAL@EMAIL_DOMAIN`. */
  readonly fromAddress: string;
  readonly onError: (error: unknown, kind: AccountEmailKind) => void;
}

const displayName = (name: string): string => `"${name.replace(/["\\\r\n]/g, ' ')}"`;

export function createAccountMailer({ sender, platformName, fromAddress, onError }: AccountMailerDeps): AccountMailer {
  const from = `${displayName(platformName)} <${fromAddress}>`;
  return {
    send(to, input) {
      const email = buildAccountEmail(input);
      const delivery = (async () =>
        sender.send({
          from,
          replyTo: fromAddress,
          to,
          subject: email.subject,
          text: email.text,
          html: email.html,
          headers: { 'Auto-Submitted': 'auto-generated' },
        }))();
      delivery.catch((error: unknown) => onError(error, input.kind));
    },
  };
}

/** Invitation accept page on the web app. */
export const acceptInvitationUrl = (platformUrl: string, invitationId: string): string =>
  `${platformUrl.replace(/\/$/, '')}/accept-invitation/${encodeURIComponent(invitationId)}`;
