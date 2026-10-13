export interface InvitationEmail {
  readonly to: string;
  readonly organizationName: string;
  readonly inviterName: string;
  readonly role: string;
  readonly acceptUrl: string;
}

/** Outgoing email. Real providers (Resend, SMTP) implement this in a later phase. */
export interface EmailSender {
  sendInvitation(email: InvitationEmail): Promise<void>;
}

export interface LogLike {
  info(object: Record<string, unknown>, message: string): void;
}

/** Writes the accept link to the log instead of sending anything: enough for development and self-hosting trials. */
export const createLogEmailSender = (logger: LogLike): EmailSender => ({
  async sendInvitation(email) {
    logger.info(
      { to: email.to, organization: email.organizationName, role: email.role, acceptUrl: email.acceptUrl },
      'invitation email (log provider)',
    );
  },
});

export const acceptInvitationUrl = (platformUrl: string, invitationId: string): string =>
  `${platformUrl.replace(/\/$/, '')}/accept-invitation/${encodeURIComponent(invitationId)}`;
