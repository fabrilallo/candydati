import { MAILPIT_URL } from './env';

export interface MailSummary {
  readonly ID: string;
  readonly Subject: string;
  readonly To: readonly { readonly Address: string }[];
  readonly Created: string;
}

export interface MailMessage extends MailSummary {
  readonly Text: string;
  readonly HTML: string;
}

const getJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${MAILPIT_URL}${path}`);
  if (!response.ok) throw new Error(`Mailpit ${path} answered ${response.status}`);
  return (await response.json()) as T;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Messages addressed to one recipient (Mailpit search, so other tests' mail never matches). */
export const messagesTo = async (recipient: string): Promise<readonly MailSummary[]> => {
  const query = encodeURIComponent(`to:"${recipient}"`);
  const result = await getJson<{ messages: readonly MailSummary[] | null }>(`/api/v1/search?query=${query}&limit=50`);
  return result.messages ?? [];
};

export interface WaitOptions {
  readonly subject?: RegExp;
  readonly timeoutMs?: number;
}

/** Polls Mailpit until a message for `recipient` (optionally matching the subject) shows up, then returns it in full. */
export const waitForMail = async (recipient: string, options: WaitOptions = {}): Promise<MailMessage> => {
  const deadline = Date.now() + (options.timeoutMs ?? 30_000);
  for (;;) {
    const found = (await messagesTo(recipient)).find((m) => (options.subject ? options.subject.test(m.Subject) : true));
    if (found) return getJson<MailMessage>(`/api/v1/message/${found.ID}`);
    if (Date.now() > deadline) throw new Error(`No email for ${recipient}${options.subject ? ` matching ${options.subject}` : ''} within the timeout`);
    await sleep(500);
  }
};

/** First absolute URL in the message body whose path matches `pattern`. */
export const linkIn = (message: MailMessage, pattern: RegExp): string => {
  const urls = `${message.Text}\n${message.HTML}`.match(/https?:\/\/[^\s"'<>)\]]+/g) ?? [];
  const url = urls.map((u) => u.replace(/&amp;/g, '&')).find((u) => pattern.test(u));
  if (!url) throw new Error(`No link matching ${pattern} in email "${message.Subject}"`);
  return url;
};
