import type { EmailSender } from '@candydati/core';
import { buildAccountEmail, type AccountEmailInput, type AccountEmailKind } from '@candydati/domain';

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
  /** `<local part>@<sending domain>` of the settings in force (they can change while the api runs). */
  readonly fromAddress: () => string;
  readonly onError: (error: unknown, kind: AccountEmailKind) => void;
}

const displayName = (name: string): string => `"${name.replace(/["\\\r\n]/g, ' ')}"`;

export function createAccountMailer({ sender, platformName, fromAddress, onError }: AccountMailerDeps): AccountMailer {
  return {
    send(to, input) {
      const email = buildAccountEmail(input);
      const address = fromAddress();
      const delivery = (async () =>
        sender.send({
          from: `${displayName(platformName)} <${address}>`,
          replyTo: address,
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
