export interface EmailMessage {
  readonly from: string;
  readonly replyTo?: string | undefined;
  readonly to: readonly string[];
  readonly subject: string;
  readonly text: string;
  readonly html?: string | undefined;
  /** Extra headers, e.g. `Auto-Submitted`, `References`, `In-Reply-To`. The caller decides which. */
  readonly headers?: Readonly<Record<string, string>> | undefined;
}

export type DomainVerification = 'verified' | 'pending' | 'failed' | 'unsupported';

export interface DnsRecord {
  readonly type: string;
  readonly name: string;
  readonly value: string;
}

export interface DomainStatus {
  readonly status: DomainVerification;
  readonly records: readonly DnsRecord[];
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<{ readonly providerMessageId: string }>;
  domainStatus(domain: string): Promise<DomainStatus>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Normalized inbound message, the input of `receiveInboundEmail`. */
export interface InboundEmail {
  readonly to: readonly string[];
  readonly from: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string | undefined;
  readonly messageId: string;
  readonly inReplyTo?: string | undefined;
  readonly receivedAt: Date;
}

export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly transient: boolean,
  ) {
    super(message);
    this.name = 'EmailSendError';
  }
}
