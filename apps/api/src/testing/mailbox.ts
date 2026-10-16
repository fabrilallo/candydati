import type { AccountEmailInput, AccountEmailKind } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import type { AccountMailer } from '../auth/account-mailer.js';

export interface RecordedMail {
  readonly to: string;
  readonly email: AccountEmailInput;
}

/** Account mailer of the tests: records every email synchronously, sends nothing. */
export interface RecordingMailer extends AccountMailer {
  readonly sent: readonly RecordedMail[];
  /** The link of the newest email of `kind` to `to`, or throws. */
  linkFor(to: string, kind: AccountEmailKind): string;
  /**
   * Same, waiting up to `timeoutMs`: Better Auth sends some account emails after it has answered (sign-up
   * verification), so under load the email can land a moment after the request returns.
   */
  waitForLink(to: string, kind: AccountEmailKind, timeoutMs?: number): Promise<string>;
}

const MAIL_WAIT_MS = 5_000;
const MAIL_POLL_MS = 10;

export function createRecordingMailer(): RecordingMailer {
  const sent: RecordedMail[] = [];
  const newest = (to: string, kind: AccountEmailKind): RecordedMail | undefined =>
    sent.filter((item) => item.to.toLowerCase() === to.toLowerCase() && item.email.kind === kind).at(-1);
  return {
    sent,
    send(to, email) {
      sent.push({ to, email });
    },
    linkFor(to, kind) {
      const mail = newest(to, kind);
      if (!mail) throw new Error(`no ${kind} email to ${to}`);
      return mail.email.link;
    },
    async waitForLink(to, kind, timeoutMs = MAIL_WAIT_MS) {
      const deadline = Date.now() + timeoutMs;
      while (!newest(to, kind) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, MAIL_POLL_MS));
      return this.linkFor(to, kind);
    },
  };
}

const mailboxes = new WeakMap<FastifyInstance, RecordingMailer>();

/** Lets a `TestUser` holding only the app find the emails it was sent (verification link at sign-up). */
export const registerMailbox = (app: FastifyInstance, mailbox: RecordingMailer): void => void mailboxes.set(app, mailbox);
export const mailboxOf = (app: FastifyInstance): RecordingMailer | null => mailboxes.get(app) ?? null;

/** Path and query of an absolute link, ready for `app.inject`. */
export const pathOf = (link: string): string => {
  const url = new URL(link);
  return `${url.pathname}${url.search}`;
};
