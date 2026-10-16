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
}

export function createRecordingMailer(): RecordingMailer {
  const sent: RecordedMail[] = [];
  return {
    sent,
    send(to, email) {
      sent.push({ to, email });
    },
    linkFor(to, kind) {
      const mail = sent.filter((item) => item.to.toLowerCase() === to.toLowerCase() && item.email.kind === kind).at(-1);
      if (!mail) throw new Error(`no ${kind} email to ${to}`);
      return mail.email.link;
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
