import type { DigestEntry, EmailSender } from '@tt/core';
import { textToHtml, type Locale, type NotificationKind } from '@tt/domain';

export interface DigestSender {
  readonly sender: EmailSender;
  /** Formatted From of the platform identity, e.g. `"Platform" <noreply@example.com>`. Never a candidate-facing identity. */
  readonly from: string;
  /** Public base URL of the web app. */
  readonly platformUrl: string;
  readonly locale: Locale;
}

/** `"Platform" <noreply@domain>`: the platform's own identity, never an organization's or a candidate-facing one. */
export const formatDigestFrom = (platformName: string, address: string): string => `"${platformName.replace(/["\\\r\n]/g, ' ')}" <${address}>`;

const ATTENTION_PATH = '/app/attention';

interface Copy {
  readonly subject: (count: number) => string;
  readonly greeting: (name: string) => string;
  readonly intro: string;
  readonly kinds: Readonly<Record<NotificationKind, string>>;
  readonly noJob: string;
  readonly open: string;
}

const COPY: Readonly<Record<Locale, Copy>> = {
  it: {
    subject: (n) => (n === 1 ? '1 novità da gestire' : `${n} novità da gestire`),
    greeting: (name) => `Ciao ${name},`,
    intro: 'Dall’ultimo controllo ci sono novità che richiedono la tua attenzione:',
    kinds: {
      response_due_soon: 'risposta in scadenza',
      response_overdue: 'risposta scaduta',
      task_assigned: 'attività assegnata',
      task_due: 'attività in scadenza',
      job_close_blocked: 'chiusura annuncio bloccata',
      automation_failed: 'automazione non riuscita',
    },
    noJob: 'altro',
    open: 'Apri la lista',
  },
  en: {
    subject: (n) => (n === 1 ? '1 item needs your attention' : `${n} items need your attention`),
    greeting: (name) => `Hi ${name},`,
    intro: 'Since the last check, these need your attention:',
    kinds: {
      response_due_soon: 'response due soon',
      response_overdue: 'response overdue',
      task_assigned: 'task assigned',
      task_due: 'task due',
      job_close_blocked: 'job close blocked',
      automation_failed: 'automation failed',
    },
    noJob: 'other',
    open: 'Open the list',
  },
};

/** Counts per job and kind. Only job titles and counts: no candidate name or address ever goes into a digest. */
function summarize(entry: DigestEntry, copy: Copy): readonly string[] {
  const counts = new Map<string, number>();
  for (const { jobId, kind } of entry.notifications) {
    const title = jobId ? (entry.jobTitles[jobId] ?? copy.noJob) : copy.noJob;
    const line = `${title}: ${copy.kinds[kind]}`;
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return [...counts].map(([line, count]) => (count > 1 ? `- ${line} (${count})` : `- ${line}`));
}

export function buildDigestEmail(config: DigestSender, entry: DigestEntry): { subject: string; text: string; html: string } {
  const copy = COPY[config.locale];
  const link = `${config.platformUrl.replace(/\/$/, '')}${ATTENTION_PATH}`;
  const text = [copy.greeting(entry.name), copy.intro, summarize(entry, copy).join('\n'), `${copy.open}: ${link}`].join('\n\n');
  return { subject: copy.subject(entry.notifications.length), text, html: textToHtml(text) };
}

export interface DigestResult {
  readonly sent: number;
  readonly failed: number;
}

/**
 * One email per person with what this scan found. A failed send is counted and logged by the caller as a number only:
 * addresses never reach the logs, and one bad mailbox does not stop the others. In-app notifications exist regardless.
 */
export async function sendDigests(config: DigestSender, entries: readonly DigestEntry[]): Promise<DigestResult> {
  let sent = 0;
  let failed = 0;
  for (const entry of entries) {
    const { subject, text, html } = buildDigestEmail(config, entry);
    try {
      await config.sender.send({ from: config.from, replyTo: config.from, to: entry.email, subject, text, html, headers: { 'Auto-Submitted': 'auto-generated' } });
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  return { sent, failed };
}
